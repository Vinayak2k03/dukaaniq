import { formatLocalDate } from "@/lib/money";
import { addDays } from "@/server/analytics/range";
import { rupeesText } from "./text";

/** Pure credit-reminder content shared by detectReminders and the growth-tips engine. The ledger supplies every figure. */
export type ReminderInput = { name: string; balancePaise: number; overduePaise: number; pastGracePaise: number; daysOverdue: number; graceDays: number; ref: string; isDemo: boolean };

export function reminderContent(r: ReminderInput) {
  const dueDate = addDays(r.ref, -r.daysOverdue);
  const amount = rupeesText(r.pastGracePaise);
  return {
    dueDate,
    amountRupees: amount,
    dueDateText: formatLocalDate(dueDate),
    title: `Remind ${r.name} about ${amount} overdue`,
    why: `${r.name} has ${amount} of unpaid credit that is more than ${r.graceDays} days past its due date (oldest due ${formatLocalDate(dueDate)}, ${r.daysOverdue} days ago). Total outstanding is ${rupeesText(r.balancePaise)}.`,
    whatIf: `If you approve, DukaanIQ records a polite reminder for ${r.name}.${r.isDemo ? " This is a demo store: nothing is actually sent." : ""} A reminder is not a payment; the balance only changes when you record a repayment in the ledger.`,
    evidence: { rule: `Unpaid credit more than ${r.graceDays} days past its due date`, asOf: r.ref, balancePaise: r.balancePaise, overduePaise: r.overduePaise, pastGracePaise: r.pastGracePaise, oldestDueDate: dueDate, daysOverdue: r.daysOverdue, graceDays: r.graceDays },
    economics: { amountAtStakePaise: r.pastGracePaise, note: "No repayment is predicted. Repayment only counts when recorded in the ledger." },
  };
}
