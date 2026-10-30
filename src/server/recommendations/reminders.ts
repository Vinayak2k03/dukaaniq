import "server-only";
import { db } from "@/lib/db";
import { listAccounts } from "@/server/credit/service";
import type { Draft } from "./draft";
import { composeMessage } from "./compose";
import { reminderContent } from "./reminder-content";
import type { Tone } from "./text";

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
      const c = reminderContent({ name: r.name, balancePaise: a.balancePaise, overduePaise: a.overduePaise, pastGracePaise: a.pastGracePaise, daysOverdue: a.daysOverdue, graceDays, ref, isDemo: merchant.isDemo });
      const { message, source } = await composeMessage({ kind: "CREDIT_REMINDER", language, tone, shopName: merchant.shopName, amountRupees: c.amountRupees, dueDate: c.dueDateText });
      return {
        type: "CREDIT_REMINDER",
        title: c.title,
        explanation: `${c.why}\n\n${c.whatIf}`,
        evidence: { ...c.evidence, messageSource: source },
        offerTerms: { tone, changesFromPrevious: changes },
        economics: c.economics,
        message,
        language,
        channel: "WHATSAPP_MANUAL_LINK",
        audience: [{ customerId: r.customerId, lastPurchaseAt: null, daysSinceLastPurchase: null }],
      };
    }),
  );
}
