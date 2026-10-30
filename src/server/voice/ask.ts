import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatPaise } from "@/lib/money";
import { getCustomerRecency, getPaymentMix, getProductStats, getSummary, countSegments, inactiveCustomers } from "@/server/analytics/queries";
import { referenceDateFor, resolveRange } from "@/server/analytics/range";
import { listAccounts, summarize } from "@/server/credit/service";
import { sarvamChat } from "@/server/sarvam/client";
import type { VoiceLanguage } from "@/lib/validation/tips";

/**
 * Read-only "ask anything about my shop" (PRD 10.2 read-only questions). The database computes a compact fact
 * sheet; the model only phrases an answer from it. Replies that contain a number missing from the facts are
 * rejected (PRD 5: an LLM must not invent figures), and the caller falls back to the fixed answers.
 */

export type Turn = { user: string; assistant: string };
type Merchant = { id: string; isDemo: boolean; shopName: string };

const LANG_RULE: Record<VoiceLanguage, string> = {
  HINDI: "Reply in simple Hindi written in Devanagari script.",
  HINGLISH: "Reply in Hinglish: everyday Hindi written in Roman (English) letters, like a shopkeeper talks.",
  ENGLISH: "Reply in simple Indian English.",
};

const rs = (paise: number) => formatPaise(paise);

/** Every figure the answer may use, as short labelled lines. */
export async function factSheet(merchant: Merchant, customerId?: string): Promise<string> {
  const ref = referenceDateFor(merchant);
  const range = (key: "today" | "7d" | "30d") =>
    resolveRange(key === "today" ? { range: "custom", from: ref, to: ref } : { range: key }, ref).range;
  const [today, week, month] = [range("today"), range("7d"), range("30d")];
  const policy = await db.creditPolicy.findUnique({ where: { merchantId: merchant.id }, select: { gracePeriodDays: true } });
  const [sToday, sWeek, sMonth, products, mix, recency, accounts, pending] = await Promise.all([
    getSummary(merchant.id, today),
    getSummary(merchant.id, week),
    getSummary(merchant.id, month),
    getProductStats(merchant.id, month),
    getPaymentMix(merchant.id, month),
    getCustomerRecency(merchant.id, ref),
    listAccounts(merchant, ref, policy?.gracePeriodDays ?? 0),
    db.recommendation.count({ where: { merchantId: merchant.id, status: { in: ["DRAFT", "PENDING_APPROVAL"] } } }),
  ]);
  const sum = (label: string, s: typeof sToday, r: typeof today) =>
    `${label} (${r.fromDate} to ${r.toDate}): sales ${rs(s.netSalesPaise)}, ${s.orders} paid orders, average bill ${rs(s.averageOrderValuePaise)}, ${s.customersServed} customers, gross profit ${rs(s.grossProfitPaise)}`;
  const byRevenue = [...products].sort((a, b) => b.revenuePaise - a.revenuePaise);
  const byProfit = [...products].sort((a, b) => b.grossProfitPaise - a.grossProfitPaise);
  const seg = countSegments(recency);
  const credit = summarize(accounts);
  const debtors = accounts.filter((a) => a.account.balancePaise > 0).sort((a, b) => b.account.balancePaise - a.account.balancePaise);
  const lines = [
    `Shop: ${merchant.shopName}. Today is ${ref}.`,
    sum("Today", sToday, today),
    sum("Last 7 days", sWeek, week),
    sum("Last 30 days", sMonth, month),
    `Top sellers by sales, last 30 days: ${byRevenue.slice(0, 5).map((p) => `${p.name} ${rs(p.revenuePaise)} (${p.quantity} sold)`).join("; ") || "none"}`,
    `Top products by profit, last 30 days: ${byProfit.slice(0, 5).map((p) => `${p.name} ${rs(p.grossProfitPaise)}`).join("; ") || "none"}`,
    `Slowest products, last 30 days: ${byRevenue.slice(-3).reverse().map((p) => `${p.name} ${rs(p.revenuePaise)}`).join("; ") || "none"}`,
    `Payment methods, last 30 days: ${mix.map((m) => `${m.method} ${m.orders} orders ${rs(m.netSalesPaise)}`).join("; ") || "none"}`,
    `Customers: ${seg.ACTIVE} active (bought in 14 days), ${seg.COOLING_OFF} cooling off (15-30 days), ${seg.INACTIVE} inactive (over 30 days), ${seg.NO_PURCHASE} never bought`,
    `Longest-away customers: ${inactiveCustomers(recency).slice(0, 5).map((c) => `${c.name} ${c.daysSinceLastPurchase} days`).join("; ") || "none"}`,
    `Udhaar: ${rs(credit.totalOutstandingPaise)} outstanding from ${credit.customersWithBalance} customers; ${rs(credit.totalOverduePaise)} overdue from ${credit.overdueCustomers} customers`,
    `Biggest udhaar balances: ${debtors.slice(0, 5).map((d) => `${d.name} ${rs(d.account.balancePaise)}${d.account.overduePaise > 0 ? ` (${rs(d.account.overduePaise)} overdue, ${d.account.daysOverdue} days)` : ""}`).join("; ") || "none"}`,
    `Proposals waiting for approval: ${pending}`,
  ];
  const one = customerId ? accounts.find((a) => a.customerId === customerId) : undefined;
  if (one) {
    const a = one.account;
    lines.push(`Asked-about customer ${one.name}: udhaar balance ${rs(a.balancePaise)}, overdue ${rs(a.overduePaise)}${a.daysOverdue > 0 ? ` for ${a.daysOverdue} days` : ""}${a.nextDueDate ? `, next due ${a.nextDueDate}` : ""}`);
  }
  return lines.join("\n");
}

/** Digit groups in a text, commas removed ("₹1,250.50" → "1250.50", "1250"). */
const numbers = (t: string) => (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).flatMap((n) => {
  const v = n.replace(/,/g, "");
  return [v, v.replace(/\.\d+$/, "")];
});

/** True when every number in the reply also appears in the facts, the question or the recent turns. Small counts (list numbering) are allowed. */
export function usesOnlyKnownNumbers(reply: string, known: string): boolean {
  const ok = new Set(numbers(known));
  return numbers(reply).every((n) => ok.has(n) || Number(n) <= 10);
}

const SYSTEM = (language: VoiceLanguage) =>
  [
    "You are DukaanIQ, a friendly assistant for a small Indian shop owner. Answer the owner's question about their own shop.",
    "Use ONLY the FACTS below. Copy every rupee amount, count and date exactly as written there; never calculate new totals, percentages or estimates.",
    "If the facts do not contain the answer, say so briefly and suggest which app page to open (Dashboard, Customers, Udhaar, Growth Tips, Action Centre).",
    "Use the recent conversation to understand follow-up questions such as 'and last week?' or 'uska kitna?'.",
    "You cannot save, send or approve anything; if asked to, say the owner must do it on screen.",
    "Keep it to 1-3 short sentences, no markdown, no lists with symbols.",
    LANG_RULE[language],
  ].join("\n");

export async function askData(merchant: Merchant, question: string, language: VoiceLanguage, history: Turn[], customerId?: string): Promise<string | null> {
  const facts = await factSheet(merchant, customerId);
  const convo = history.slice(-3).map((t) => `Owner: ${t.user}\nYou: ${t.assistant}`).join("\n");
  const reply = await sarvamChat({
    model: env.SARVAM_CHAT_MODEL,
    system: `${SYSTEM(language)}\n\nFACTS:\n${facts}`,
    user: `${convo ? `Recent conversation:\n${convo}\n\n` : ""}Question: ${question.slice(0, 300)}`,
    maxTokens: 300,
    temperature: 0.2,
    timeoutMs: 12_000,
  });
  if (!reply) return null;
  return usesOnlyKnownNumbers(reply, `${facts}\n${question}\n${convo}`) ? reply.slice(0, 600) : null;
}
