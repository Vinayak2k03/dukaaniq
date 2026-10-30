/**
 * Repayment outcomes for credit reminders (PRD 11.2). A repayment counts only when the owner recorded it in the
 * ledger after a reminder; a delivered or opened message never implies payment. This is attribution by timing,
 * not proof the reminder caused the payment.
 */

export const ATTRIBUTION_WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
const startOfIstDay = (d: Date) => Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;

export type ReminderMessage = { id: string; customerId: string; sentAt: Date; simulated: boolean };
export type LedgerRow = { id: string; customerId: string; type: "CREDIT_GIVEN" | "REPAYMENT_RECEIVED" | "ADJUSTMENT_INCREASE" | "ADJUSTMENT_DECREASE"; amountPaise: number; entryDate: Date; reversesEntryId: string | null };

export type Repayment = { entryId: string; amountPaise: number; entryDate: Date };
export type MessageOutcome = ReminderMessage & { repayments: Repayment[]; repaidPaise: number };

/** Repayments net of corrections that reversed them. Fully reversed repayments drop out. */
function netRepayments(entries: LedgerRow[]): Repayment[] {
  const reversed = new Map<string, number>();
  for (const e of entries) if (e.type === "ADJUSTMENT_INCREASE" && e.reversesEntryId) reversed.set(e.reversesEntryId, (reversed.get(e.reversesEntryId) ?? 0) + e.amountPaise);
  return entries
    .filter((e) => e.type === "REPAYMENT_RECEIVED")
    .map((e) => ({ entryId: e.id, amountPaise: Math.max(0, e.amountPaise - (reversed.get(e.id) ?? 0)), entryDate: e.entryDate }))
    .filter((r) => r.amountPaise > 0);
}

/**
 * Each repayment is credited to the latest reminder that was sent to that customer on or before the repayment's day,
 * and no more than `windowDays` earlier, so one payment is never counted for two reminders.
 */
export function attributeRepayments(messages: ReminderMessage[], entries: LedgerRow[], windowDays = ATTRIBUTION_WINDOW_DAYS): MessageOutcome[] {
  const outcomes = new Map<string, MessageOutcome>(messages.map((m) => [m.id, { ...m, repayments: [], repaidPaise: 0 }]));
  const byCustomer = Map.groupBy(entries, (e) => e.customerId);

  for (const [customerId, rows] of byCustomer) {
    const sent = messages.filter((m) => m.customerId === customerId).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    for (const r of netRepayments(rows)) {
      const owner = sent.find((m) => startOfIstDay(m.sentAt) <= r.entryDate.getTime() && r.entryDate.getTime() < startOfIstDay(m.sentAt) + (windowDays + 1) * DAY_MS);
      if (!owner) continue;
      const o = outcomes.get(owner.id)!;
      o.repayments.push(r);
      o.repaidPaise += r.amountPaise;
    }
  }
  return [...outcomes.values()];
}

export type OutcomeSummary = { reminded: number; repaidCustomers: number; repaidPaise: number };

export function summarizeOutcomes(outcomes: MessageOutcome[]): OutcomeSummary {
  const repaid = new Set(outcomes.filter((o) => o.repaidPaise > 0).map((o) => o.customerId));
  return { reminded: new Set(outcomes.map((o) => o.customerId)).size, repaidCustomers: repaid.size, repaidPaise: outcomes.reduce((t, o) => t + o.repaidPaise, 0) };
}
