import "server-only";
import { db } from "@/lib/db";
import { attributeRepayments, summarizeOutcomes, type LedgerRow, type MessageOutcome, type OutcomeSummary } from "./repayments";

export type ReminderOutcomeRow = MessageOutcome & { customerName: string; recommendationId: string };
export type ReminderOutcomes = { rows: ReminderOutcomeRow[]; real: OutcomeSummary; demo: OutcomeSummary };

/** Derived on read from the ledger, so corrections and late repayments are always reflected. Demo (simulated) results are kept apart. */
export async function getReminderOutcomes(merchantId: string, recommendationId?: string): Promise<ReminderOutcomes> {
  const messages = await db.outboundMessage.findMany({
    where: {
      merchantId,
      status: { not: "FAILED" },
      actionLog: { recommendationVersion: { recommendation: { type: "CREDIT_REMINDER", ...(recommendationId ? { id: recommendationId } : {}) } } },
    },
    select: { id: true, customerId: true, createdAt: true, simulated: true, customer: { select: { displayName: true } }, actionLog: { select: { recommendationVersion: { select: { recommendationId: true } } } } },
  });
  const customerIds = [...new Set(messages.map((m) => m.customerId))];
  const entries = customerIds.length
    ? await db.creditEntry.findMany({
        where: { merchantId, customerId: { in: customerIds }, type: { in: ["REPAYMENT_RECEIVED", "ADJUSTMENT_INCREASE"] } },
        select: { id: true, customerId: true, type: true, amount: true, entryDate: true, reversesEntryId: true },
      })
    : [];
  const ledger: LedgerRow[] = entries.map((e) => ({ ...e, amountPaise: e.amount.mul(100).toDecimalPlaces(0).toNumber() }));

  const meta = new Map(messages.map((m) => [m.id, { customerName: m.customer.displayName, recommendationId: m.actionLog.recommendationVersion.recommendationId }]));
  const outcomes = attributeRepayments(messages.map((m) => ({ id: m.id, customerId: m.customerId, sentAt: m.createdAt, simulated: m.simulated })), ledger);
  const rows = outcomes.map((o) => ({ ...o, ...meta.get(o.id)! })).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  return { rows, real: summarizeOutcomes(rows.filter((r) => !r.simulated)), demo: summarizeOutcomes(rows.filter((r) => r.simulated)) };
}
