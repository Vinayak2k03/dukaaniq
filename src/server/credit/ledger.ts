import { daysBetween } from "@/server/analytics/range";

/**
 * Pure credit-ledger maths (PRD 8). No database or framework imports so it can be unit tested.
 *
 * Balance = CREDIT_GIVEN + ADJUSTMENT_INCREASE - REPAYMENT_RECEIVED - ADJUSTMENT_DECREASE.
 * Repayments (and decrease adjustments) are applied to the oldest credit first (FIFO), which
 * tells us which credit is still unpaid and whether any of it is past its due date.
 * Overdue = unpaid credit whose due date (Asia/Kolkata calendar day) is before the reference date.
 * pastGracePaise = overdue credit that is also more than `graceDays` past due (reminder eligibility).
 */

export type EntryType = "CREDIT_GIVEN" | "REPAYMENT_RECEIVED" | "ADJUSTMENT_INCREASE" | "ADJUSTMENT_DECREASE";
export type CreditStatus = "NO_CREDIT" | "SETTLED" | "OVERDUE" | "DUE_TODAY" | "UPCOMING";

export type LedgerEntry = {
  id: string;
  type: EntryType;
  amountPaise: number;
  entryDate: Date;
  dueDate: Date | null;
};

export type UnpaidLot = { entryId: string; remainingPaise: number; entryDate: Date; dueYmd: string | null };

export type Account = {
  creditGivenPaise: number;
  repaidPaise: number;
  adjustmentNetPaise: number;
  balancePaise: number;
  oldestUnpaid: UnpaidLot | null;
  nextDueDate: string | null;
  overduePaise: number;
  daysOverdue: number;
  pastGracePaise: number;
  status: CreditStatus;
};

const IST_OFFSET_MS = 330 * 60_000;
export const localYmd = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

export const signedEffectPaise = (e: Pick<LedgerEntry, "type" | "amountPaise">) =>
  e.type === "CREDIT_GIVEN" || e.type === "ADJUSTMENT_INCREASE" ? e.amountPaise : -e.amountPaise;

export function computeAccount(entries: LedgerEntry[], referenceDate: string, graceDays = 0): Account {
  const sorted = [...entries].sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime() || a.id.localeCompare(b.id));
  const sum = (type: EntryType) => sorted.filter((e) => e.type === type).reduce((t, e) => t + e.amountPaise, 0);
  const creditGivenPaise = sum("CREDIT_GIVEN");
  const repaidPaise = sum("REPAYMENT_RECEIVED");
  const adjustmentNetPaise = sum("ADJUSTMENT_INCREASE") - sum("ADJUSTMENT_DECREASE");
  const balancePaise = creditGivenPaise + adjustmentNetPaise - repaidPaise;

  let pool = repaidPaise + sum("ADJUSTMENT_DECREASE");
  const unpaid: UnpaidLot[] = [];
  for (const e of sorted) {
    if (e.type !== "CREDIT_GIVEN" && e.type !== "ADJUSTMENT_INCREASE") continue;
    const applied = Math.min(e.amountPaise, pool);
    pool -= applied;
    const remainingPaise = e.amountPaise - applied;
    if (remainingPaise > 0) unpaid.push({ entryId: e.id, remainingPaise, entryDate: e.entryDate, dueYmd: e.dueDate ? localYmd(e.dueDate) : null });
  }

  const overdueLots = unpaid.filter((l) => l.dueYmd !== null && l.dueYmd < referenceDate);
  const upcomingDue = unpaid.flatMap((l) => (l.dueYmd !== null && l.dueYmd >= referenceDate ? [l.dueYmd] : [])).sort();
  const overduePaise = overdueLots.reduce((t, l) => t + l.remainingPaise, 0);
  const pastGracePaise = overdueLots.filter((l) => daysBetween(l.dueYmd ?? referenceDate, referenceDate) > graceDays).reduce((t, l) => t + l.remainingPaise, 0);
  const daysOverdue = overdueLots.reduce((m, l) => Math.max(m, daysBetween(l.dueYmd ?? referenceDate, referenceDate)), 0);

  const status: CreditStatus =
    sorted.length === 0 ? "NO_CREDIT" : balancePaise <= 0 ? "SETTLED" : overduePaise > 0 ? "OVERDUE" : upcomingDue[0] === referenceDate ? "DUE_TODAY" : "UPCOMING";

  return {
    creditGivenPaise,
    repaidPaise,
    adjustmentNetPaise,
    balancePaise,
    oldestUnpaid: unpaid[0] ?? null,
    nextDueDate: upcomingDue[0] ?? null,
    overduePaise,
    daysOverdue,
    pastGracePaise,
    status,
  };
}

/** Largest amount that can still be corrected on an entry: its amount minus corrections already linked to it. */
export const correctableRemainingPaise = (target: LedgerEntry, reversals: Pick<LedgerEntry, "amountPaise">[]) =>
  Math.max(0, target.amountPaise - reversals.reduce((t, r) => t + r.amountPaise, 0));
