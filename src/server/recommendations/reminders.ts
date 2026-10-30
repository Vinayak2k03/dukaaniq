import "server-only";
import { db } from "@/lib/db";
import { formatLocalDate } from "@/lib/money";
import { addDays } from "@/server/analytics/range";
import { listAccounts } from "@/server/credit/service";
import type { Draft } from "./draft";
import { composeMessage } from "./compose";
import { rupeesText, type Tone } from "./text";

type Merchant = { id: string; isDemo: boolean; shopName: string };

/**
 * Deterministic credit-reminder detection. The ledger decides who is overdue (past the merchant's
 * grace period) and how much; a text provider only phrases the message.
 */
export async function detectReminders(merchant: Merchant, ref: string, tone: Tone = "standard", changes: string[] = []): Promise<Draft[]> {
  const policy = await db.creditPolicy.findUnique({ where: { merchantId: merchant.id }, select: { gracePeriodDays: true } });
  const graceDays = policy?.gracePeriodDays ?? 0;
  const due = (await listAccounts(merchant, ref, graceDays)).filter((r) => r.account.pastGracePaise > 0);
  const customers = await db.customer.findMany({ where: { merchantId: merchant.id, id: { in: due.map((d) => d.customerId) } }, select: { id: true, preferredLanguage: true } });
  const lang = new Map(customers.map((c) => [c.id, c.preferredLanguage]));

  return Promise.all(
    due.map(async (r): Promise<Draft> => {
      const a = r.account;
      const language = lang.get(r.customerId) ?? "ENGLISH";
      const dueDate = addDays(ref, -a.daysOverdue);
      const { message, source } = await composeMessage({ kind: "CREDIT_REMINDER", language, tone, shopName: merchant.shopName, amountRupees: rupeesText(a.pastGracePaise), dueDate: formatLocalDate(dueDate) });
      return {
        type: "CREDIT_REMINDER",
        title: `Remind ${r.name} about ${rupeesText(a.pastGracePaise)} overdue`,
        explanation: `${r.name} has ${rupeesText(a.pastGracePaise)} of unpaid credit that is more than ${graceDays} days past its due date (oldest due ${formatLocalDate(dueDate)}, ${a.daysOverdue} days ago). Total outstanding is ${rupeesText(a.balancePaise)}.\n\nIf you approve, DukaanIQ records a polite reminder for ${r.name}.${merchant.isDemo ? " This is a demo store: nothing is actually sent." : ""} A reminder is not a payment; the balance only changes when you record a repayment in the ledger.`,
        evidence: { rule: `Unpaid credit more than ${graceDays} days past its due date`, asOf: ref, balancePaise: a.balancePaise, overduePaise: a.overduePaise, pastGracePaise: a.pastGracePaise, oldestDueDate: dueDate, daysOverdue: a.daysOverdue, graceDays, messageSource: source },
        offerTerms: { tone, changesFromPrevious: changes },
        economics: { amountAtStakePaise: a.pastGracePaise, note: "No repayment is predicted. Repayment only counts when recorded in the ledger." },
        message,
        language,
        channel: "WHATSAPP_MANUAL_LINK",
        audience: [{ customerId: r.customerId, lastPurchaseAt: null, daysSinceLastPurchase: null }],
      };
    }),
  );
}
