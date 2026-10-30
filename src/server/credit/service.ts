import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import type { CorrectionInput, CreditEntryInput } from "@/lib/validation/credit";
import { referenceDateFor } from "@/server/analytics/range";
import { computeAccount, correctableRemainingPaise, localYmd, signedEffectPaise, type Account, type LedgerEntry } from "./ledger";

/**
 * All credit reads and writes go through here (server actions and Route Handlers share it).
 * Callers must pass a merchantId taken from the user's verified membership, never from the request.
 */

type Merchant = { id: string; isDemo: boolean };
type Actor = { userId: string };
export type WriteResult = { ok: true; entryId: string; duplicate: boolean } | { ok: false; error: string; field?: string };

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const money = (paise: number) => (paise / 100).toFixed(2);
const noon = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) + DAY_MS / 2 - IST_OFFSET_MS);
const midnight = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - IST_OFFSET_MS);

const toLedgerEntry = (e: { id: string; type: LedgerEntry["type"]; amount: Prisma.Decimal; entryDate: Date; dueDate: Date | null }): LedgerEntry => ({
  id: e.id,
  type: e.type,
  amountPaise: e.amount.mul(100).toDecimalPlaces(0).toNumber(),
  entryDate: e.entryDate,
  dueDate: e.dueDate,
});

const entrySelect = { id: true, type: true, amount: true, entryDate: true, dueDate: true } as const;

export type AccountRow = { customerId: string; name: string; entryCount: number; account: Account };

export async function listAccounts(merchant: Merchant, referenceDate: string, graceDays = 0): Promise<AccountRow[]> {
  const [customers, entries] = await Promise.all([
    db.customer.findMany({ where: { merchantId: merchant.id }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    db.creditEntry.findMany({ where: { merchantId: merchant.id }, select: { ...entrySelect, customerId: true } }),
  ]);
  const byCustomer = new Map<string, LedgerEntry[]>();
  for (const e of entries) byCustomer.set(e.customerId, [...(byCustomer.get(e.customerId) ?? []), toLedgerEntry(e)]);
  return customers.map((c) => {
    const list = byCustomer.get(c.id) ?? [];
    return { customerId: c.id, name: c.displayName, entryCount: list.length, account: computeAccount(list, referenceDate, graceDays) };
  });
}

export function summarize(rows: AccountRow[]) {
  const withBalance = rows.filter((r) => r.account.balancePaise > 0);
  const overdue = rows.filter((r) => r.account.overduePaise > 0);
  return {
    totalOutstandingPaise: withBalance.reduce((t, r) => t + r.account.balancePaise, 0),
    customersWithBalance: withBalance.length,
    totalOverduePaise: overdue.reduce((t, r) => t + r.account.overduePaise, 0),
    overdueCustomers: overdue.length,
  };
}

export type LedgerLine = {
  id: string;
  type: LedgerEntry["type"];
  amountPaise: number;
  entryDate: Date;
  dueYmd: string | null;
  paymentMethod: string | null;
  note: string | null;
  reason: string | null;
  reversesEntryId: string | null;
  imported: boolean;
  runningBalancePaise: number;
};

export async function getCustomerLedger(merchant: Merchant, customerId: string, referenceDate: string) {
  const customer = await db.customer.findFirst({ where: { id: customerId, merchantId: merchant.id }, select: { id: true, displayName: true } });
  if (!customer) return null;
  const rows = await db.creditEntry.findMany({
    where: { merchantId: merchant.id, customerId },
    select: { ...entrySelect, paymentMethod: true, note: true, reason: true, reversesEntryId: true, idempotencyKey: true },
  });
  const sorted = rows.map((r) => ({ row: r, entry: toLedgerEntry(r) })).sort((a, b) => a.entry.entryDate.getTime() - b.entry.entryDate.getTime() || a.entry.id.localeCompare(b.entry.id));
  let running = 0;
  const lines: LedgerLine[] = sorted.map(({ row, entry }) => {
    running += signedEffectPaise(entry);
    return {
      id: entry.id,
      type: entry.type,
      amountPaise: entry.amountPaise,
      entryDate: entry.entryDate,
      dueYmd: entry.dueDate ? localYmd(entry.dueDate) : null,
      paymentMethod: row.paymentMethod,
      note: row.note,
      reason: row.reason,
      reversesEntryId: row.reversesEntryId,
      imported: row.idempotencyKey.startsWith("import:"),
      runningBalancePaise: running,
    };
  });
  const entries = sorted.map((s) => s.entry);
  const correctable = sorted
    .filter(({ entry }) => entry.type === "CREDIT_GIVEN" || entry.type === "REPAYMENT_RECEIVED")
    .map(({ row, entry }) => {
      const reversals = sorted.filter((s) => s.row.reversesEntryId === entry.id).map((s) => s.entry);
      return { id: entry.id, type: entry.type, amountPaise: entry.amountPaise, remainingPaise: correctableRemainingPaise(entry, reversals), date: entry.entryDate, note: row.note };
    })
    .filter((c) => c.remainingPaise > 0);
  return { customer, lines, account: computeAccount(entries, referenceDate), correctable };
}

async function lockCustomer(tx: Prisma.TransactionClient, merchantId: string, customerId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM customer WHERE "id" = ${customerId} AND "merchantId" = ${merchantId} FOR UPDATE`;
  return rows.length > 0;
}

async function findByKey(tx: Prisma.TransactionClient, merchantId: string, key: string) {
  return tx.creditEntry.findUnique({ where: { merchantId_idempotencyKey: { merchantId, idempotencyKey: key } }, select: { id: true } });
}

const AUDIT = { CREDIT_GIVEN: "CREDIT_GIVEN", REPAYMENT_RECEIVED: "REPAYMENT_RECEIVED" } as const;

export async function createCreditEntry(merchant: Merchant, actor: Actor, input: CreditEntryInput): Promise<WriteResult> {
  const today = referenceDateFor(merchant);
  if (input.entryDate && input.entryDate > today) return { ok: false, error: "The date cannot be in the future.", field: "entryDate" };

  return db.$transaction(
    async (tx): Promise<WriteResult> => {
      if (!(await lockCustomer(tx, merchant.id, input.customerId))) return { ok: false, error: "Customer not found." };

      const existing = await findByKey(tx, merchant.id, input.idempotencyKey);
      if (existing) return { ok: true, entryId: existing.id, duplicate: true };

      if (input.type === "REPAYMENT_RECEIVED") {
        const entries = (await tx.creditEntry.findMany({ where: { merchantId: merchant.id, customerId: input.customerId }, select: entrySelect })).map(toLedgerEntry);
        const balance = computeAccount(entries, today).balancePaise;
        if (input.amount > balance) {
          const msg = balance <= 0 ? "This customer has no outstanding balance to repay." : `Repayment is more than the outstanding balance of ${formatPaise(balance)}.`;
          return { ok: false, error: msg, field: "amount" };
        }
      }

      const created = await tx.creditEntry.create({
        data: {
          merchantId: merchant.id,
          customerId: input.customerId,
          type: input.type,
          amount: money(input.amount),
          entryDate: input.entryDate ? noon(input.entryDate) : new Date(),
          dueDate: input.dueDate ? midnight(input.dueDate) : null,
          paymentMethod: input.paymentMethod ?? null,
          note: input.note ?? null,
          actorId: actor.userId,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          merchantId: merchant.id,
          actorId: actor.userId,
          eventType: AUDIT[input.type],
          entityType: "credit_entry",
          entityId: created.id,
          metadata: { customerId: input.customerId, amountPaise: input.amount, dueDate: input.dueDate ?? null, paymentMethod: input.paymentMethod ?? null },
        },
      });
      return { ok: true, entryId: created.id, duplicate: false };
    },
    { timeout: 15_000 },
  );
}

export async function createCorrection(merchant: Merchant, actor: Actor, input: CorrectionInput): Promise<WriteResult> {
  const today = referenceDateFor(merchant);
  return db.$transaction(
    async (tx): Promise<WriteResult> => {
      if (!(await lockCustomer(tx, merchant.id, input.customerId))) return { ok: false, error: "Customer not found." };

      const existing = await findByKey(tx, merchant.id, input.idempotencyKey);
      if (existing) return { ok: true, entryId: existing.id, duplicate: true };

      const all = await tx.creditEntry.findMany({
        where: { merchantId: merchant.id, customerId: input.customerId },
        select: { ...entrySelect, reversesEntryId: true },
      });
      const target = all.find((e) => e.id === input.targetEntryId);
      if (!target || (target.type !== "CREDIT_GIVEN" && target.type !== "REPAYMENT_RECEIVED"))
        return { ok: false, error: "That entry cannot be corrected.", field: "targetEntryId" };

      const remaining = correctableRemainingPaise(toLedgerEntry(target), all.filter((e) => e.reversesEntryId === target.id).map(toLedgerEntry));
      if (input.amount > remaining) return { ok: false, error: `You can correct at most ${formatPaise(remaining)} of this entry.`, field: "amount" };

      // Undoing credit lowers the balance; undoing a repayment raises it.
      const type = target.type === "CREDIT_GIVEN" ? "ADJUSTMENT_DECREASE" : "ADJUSTMENT_INCREASE";
      if (type === "ADJUSTMENT_DECREASE" && input.amount > computeAccount(all.map(toLedgerEntry), today).balancePaise)
        return { ok: false, error: "This correction would make the balance negative. Correct the repayment first.", field: "amount" };

      const created = await tx.creditEntry.create({
        data: {
          merchantId: merchant.id,
          customerId: input.customerId,
          type,
          amount: money(input.amount),
          entryDate: new Date(),
          reason: input.reason,
          reversesEntryId: target.id,
          actorId: actor.userId,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          merchantId: merchant.id,
          actorId: actor.userId,
          eventType: "CREDIT_ADJUSTED",
          entityType: "credit_entry",
          entityId: created.id,
          metadata: { customerId: input.customerId, reverses: target.id, direction: type, amountPaise: input.amount, reason: input.reason },
        },
      });
      return { ok: true, entryId: created.id, duplicate: false };
    },
    { timeout: 15_000 },
  );
}
