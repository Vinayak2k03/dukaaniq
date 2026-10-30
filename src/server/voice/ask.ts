import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTimeIST, formatPaise } from "@/lib/money";
import { getCatalog, getCustomerValue, getHourlyHeatmap, getProductPairs } from "@/server/analytics/insights";
import { slotsFrom } from "@/server/analytics/insights-math";
import { countSegments, getCustomerRecency, getPaymentMix, getProductStats, getRecentSales, getSummary, inactiveCustomers } from "@/server/analytics/queries";
import { referenceDateFor, resolveRange, type ResolvedRange } from "@/server/analytics/range";
import { getCustomerLedger, listAccounts, summarize } from "@/server/credit/service";
import { listRecommendations } from "@/server/recommendations/service";
import { Lru, sarvamChat } from "@/server/sarvam/client";
import type { VoiceLanguage } from "@/lib/validation/tips";

/**
 * Read-only "ask anything about my shop" (PRD 10.2 read-only questions).
 *
 * The assistant can look at every part of the shop's data, but only fetches what a question needs: each DATA_SOURCE
 * below is a named slice (customers, transactions, credit ledger, products, ...) with the words that call for it and a
 * loader that returns plain fact lines. To let the assistant see something new, add one entry to DATA_SOURCES.
 * The database computes every figure; the model only phrases an answer, and a reply containing a number that is not in
 * the facts is rejected (PRD 5: an LLM must not invent figures), so the caller falls back to the fixed answers.
 */

export type Turn = { user: string; assistant: string };
type Merchant = { id: string; isDemo: boolean; shopName: string };

type Ctx = {
  merchant: Merchant;
  ref: string;
  /** Set when the question names exactly one customer. */
  customerId?: string;
  range: (key: "today" | "7d" | "30d" | "90d") => ResolvedRange;
};

type DataSource = {
  id: string;
  /** Words (English, Hinglish, Hindi) that mean a question needs this slice. */
  match: RegExp;
  /** Loaded for unclear questions too. Heavy slices (full transaction lists) are only loaded when asked for. */
  brief: boolean;
  /** Seconds the loaded lines may be reused for the same shop. 0 = always fresh (data the merchant edits). */
  cacheSeconds: number;
  load: (c: Ctx) => Promise<string[]>;
};

const rs = formatPaise;
const list = (items: string[], none = "none") => (items.length ? items.join("; ") : none);
const day = (d: Date) => formatDateTimeIST(d);

const summaryLine = (label: string, s: Awaited<ReturnType<typeof getSummary>>, r: ResolvedRange) =>
  `${label} (${r.fromDate} to ${r.toDate}): sales ${rs(s.netSalesPaise)}, ${s.orders} paid orders, average bill ${rs(s.averageOrderValuePaise)}, ${s.customersServed} customers, gross profit ${rs(s.grossProfitPaise)}`;

const graceDays = async (merchantId: string) => (await db.creditPolicy.findUnique({ where: { merchantId }, select: { gracePeriodDays: true } }))?.gracePeriodDays ?? 0;

export const DATA_SOURCES: DataSource[] = [
  {
    id: "sales",
    match: /sale|sales|bikri|bikree|बिक्री|सेल|kamai|kamaai|कमाई|revenue|income|profit|munafa|मुनाफ|average|dhanda|dhandha|धंधा|aaj|today|week|hafta|hafte|हफ्ते|month|mahina|mahine|महीने|upi|cash|card|payment mode|kitna bika|becha|बेचा/i,
    brief: true,
    cacheSeconds: 60,
    async load(c) {
      const ranges = [["Today", c.range("today")], ["Last 7 days", c.range("7d")], ["Last 30 days", c.range("30d")]] as const;
      const [sums, mix] = await Promise.all([Promise.all(ranges.map(([, r]) => getSummary(c.merchant.id, r))), getPaymentMix(c.merchant.id, c.range("30d"))]);
      return [...ranges.map(([label, r], i) => summaryLine(label, sums[i], r)), `Payment methods, last 30 days: ${list(mix.map((m) => `${m.method} ${m.orders} orders ${rs(m.netSalesPaise)}`))}`];
    },
  },
  {
    id: "products",
    match: /product|item|saman|सामान|maal|माल|stock|bika|bik\b|best.?sell|top sell|slow|margin|price|rate|category|catalog|kimat|कीमत|दाम|kaun sa|कौन सा|sabse zyada|सबसे ज़्यादा|सबसे ज्यादा|most/i,
    brief: true,
    cacheSeconds: 60,
    async load(c) {
      const [stats, catalog] = await Promise.all([getProductStats(c.merchant.id, c.range("30d")), getCatalog(c.merchant.id)]);
      const byRevenue = [...stats].sort((a, b) => b.revenuePaise - a.revenuePaise);
      const byProfit = [...stats].sort((a, b) => b.grossProfitPaise - a.grossProfitPaise);
      const sold = new Set(stats.map((s) => s.productId));
      return [
        `Top sellers by sales, last 30 days: ${list(byRevenue.slice(0, 8).map((p) => `${p.name} ${rs(p.revenuePaise)} (${p.quantity} sold)`))}`,
        `Top products by profit, last 30 days: ${list(byProfit.slice(0, 8).map((p) => `${p.name} ${rs(p.grossProfitPaise)}`))}`,
        `Slowest products, last 30 days: ${list(byRevenue.slice(-5).reverse().map((p) => `${p.name} ${rs(p.revenuePaise)}`))}`,
        `Products with no sale in 30 days: ${list(catalog.filter((p) => !sold.has(p.productId)).slice(0, 10).map((p) => p.name))}`,
        `Catalog (${catalog.length} products): ${list(catalog.slice(0, 25).map((p) => `${p.name}${p.category ? ` [${p.category}]` : ""} price ${rs(p.pricePaise)}, cost ${rs(p.costPaise)}`))}`,
      ];
    },
  },
  {
    id: "customers",
    match: /customer|grahak|ग्राहक|inactive|nahi aa|नहीं आ|nahi aaye|wapas|loyal|vip|regular|best customer|top customer|log\b|kaun.{0,20}(aata|aate|aaya)|cooling|never bought|churn|visit/i,
    brief: true,
    cacheSeconds: 60,
    async load(c) {
      const [recency, value] = await Promise.all([getCustomerRecency(c.merchant.id, c.ref), getCustomerValue(c.merchant.id, c.range("90d"))]);
      const seg = countSegments(recency);
      const names = new Map(recency.map((r) => [r.customerId, r.name]));
      const inactive = inactiveCustomers(recency);
      const cooling = recency.filter((r) => r.segment === "COOLING_OFF").sort((a, b) => (b.daysSinceLastPurchase ?? 0) - (a.daysSinceLastPurchase ?? 0));
      const best = [...value].sort((a, b) => b.netSpendPaise - a.netSpendPaise).slice(0, 10);
      return [
        `Customers: ${recency.length} total, ${seg.ACTIVE} active (bought in 14 days), ${seg.COOLING_OFF} cooling off (15-30 days), ${seg.INACTIVE} inactive (over 30 days), ${seg.NO_PURCHASE} never bought`,
        `Inactive customers, longest away first (${inactive.length} in all): ${list(inactive.slice(0, 20).map((r) => `${r.name} (${r.daysSinceLastPurchase} days, last bought ${r.lastPurchaseDate})`))}`,
        `Cooling-off customers (${cooling.length} in all): ${list(cooling.slice(0, 10).map((r) => `${r.name} (${r.daysSinceLastPurchase} days)`))}`,
        `Best customers by spend, last 90 days: ${list(best.map((v) => `${names.get(v.customerId) ?? "Customer"} ${rs(v.netSpendPaise)} in ${v.orders} orders${v.topCategory ? `, likes ${v.topCategory}` : ""}`))}`,
      ];
    },
  },
  {
    id: "transactions",
    match: /transaction|bill|invoice|order|recent sale|last sale|latest sale|history|lenden|लेन.?देन|aakhri|आखिरी|pichli|पिछली|kal\b|yesterday|refund|cancel|discount|chhoot|छूट|coupon|kisne kharida|who bought/i,
    brief: false,
    cacheSeconds: 30,
    async load(c) {
      const sales = await getRecentSales(c.merchant.id, c.range("30d"), 15);
      return [`Latest transactions (newest first): ${list(sales.map((s) => `${day(s.saleDate)} ${s.customerName ?? "walk-in"}, ${s.itemCount} items, ${rs(s.netAmountPaise)}, ${s.paymentMethod}, ${s.paymentStatus}${s.status === "COMPLETED" ? "" : ` ${s.status}`}`))}`];
    },
  },
  {
    id: "credit",
    match: /udhaar|udhar|उधार|credit|ledger|khata|khate|खाता|खाते|baaki|baki|बाकी|balance|overdue|repay|owe|dues?\b|due date|bakaya|बकाया|vasool|वसूल|paise dene|dena hai|lena hai/i,
    brief: true,
    cacheSeconds: 0,
    async load(c) {
      const grace = await graceDays(c.merchant.id);
      const accounts = await listAccounts(c.merchant, c.ref, grace);
      const total = summarize(accounts);
      const owing = accounts.filter((a) => a.account.balancePaise > 0).sort((a, b) => b.account.balancePaise - a.account.balancePaise);
      const overdue = accounts.filter((a) => a.account.overduePaise > 0).sort((a, b) => b.account.daysOverdue - a.account.daysOverdue);
      const recent = await db.creditEntry.findMany({
        where: { merchantId: c.merchant.id },
        orderBy: { entryDate: "desc" },
        take: 10,
        select: { type: true, amount: true, entryDate: true, customer: { select: { displayName: true } } },
      });
      return [
        `Udhaar: ${rs(total.totalOutstandingPaise)} outstanding from ${total.customersWithBalance} customers; ${rs(total.totalOverduePaise)} overdue from ${total.overdueCustomers} customers (grace period ${grace} days)`,
        `Customers owing money, biggest first: ${list(owing.slice(0, 15).map((a) => `${a.name} ${rs(a.account.balancePaise)}${a.account.nextDueDate ? `, due ${a.account.nextDueDate}` : ""}`))}`,
        `Overdue customers, longest first: ${list(overdue.slice(0, 15).map((a) => `${a.name} ${rs(a.account.overduePaise)} overdue for ${a.account.daysOverdue} days`))}`,
        `Latest ledger entries: ${list(recent.map((e) => `${day(e.entryDate)} ${e.customer.displayName} ${e.type.replaceAll("_", " ").toLowerCase()} ${rs(Math.round(e.amount.toNumber() * 100))}`))}`,
      ];
    },
  },
  {
    id: "timing",
    match: /busy|rush|peak|hour|time\b|samay|समय|bheed|भीड़|weekday|kab\b|kab se|when|slot|khali|quiet|din\b|day of/i,
    brief: false,
    cacheSeconds: 300,
    async load(c) {
      const heat = await getHourlyHeatmap(c.merchant.id, c.range("90d"));
      const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const slots = slotsFrom(heat.cells).sort((a, b) => b.orders - a.orders);
      const fmt = (s: (typeof slots)[number]) => `${days[s.dow]} ${s.startHour}:00-${s.endHour}:00 (${s.orders} orders)`;
      return [`Busiest windows, last 90 days: ${list(slots.slice(0, 6).map(fmt))}`, `Quietest windows with sales: ${list(slots.slice(-6).reverse().map(fmt))}`];
    },
  },
  {
    id: "combos",
    match: /combo|bundle|together|saath|साथ|pair|jodi|jodi|basket|ek saath/i,
    brief: false,
    cacheSeconds: 300,
    async load(c) {
      const { pairs, baskets } = await getProductPairs(c.merchant.id, c.range("90d"));
      return [`Products bought together, last 90 days (${baskets} baskets): ${list(pairs.slice(0, 8).map((p) => `${p.a} + ${p.b} (${p.support} times)`))}`];
    },
  },
  {
    id: "proposals",
    match: /tip|recommend|proposal|action centre|approval|approve|pending|offer|suggest|sujhav|सुझाव|outcome|result|reminder|notification/i,
    brief: true,
    cacheSeconds: 0,
    async load(c) {
      const rows = await listRecommendations(c.merchant.id);
      const waiting = rows.filter((r) => r.status === "DRAFT" || r.status === "PENDING_APPROVAL");
      return [
        `Proposals waiting for approval: ${waiting.length}${waiting.length ? ` - ${list(waiting.slice(0, 8).map((r) => r.title))}` : ""}`,
        `Recent proposals: ${list(rows.slice(0, 8).map((r) => `${r.title} (${r.status.replaceAll("_", " ").toLowerCase()}, ${r.audienceSize} customers)`))}`,
      ];
    },
  },
];

/** The one customer a question is about: profile, recent purchases and ledger. Loaded whenever a single customer is named. */
async function customerLines(c: Ctx): Promise<string[]> {
  if (!c.customerId) return [];
  const [ledger, recency, sales] = await Promise.all([
    getCustomerLedger(c.merchant, c.customerId, c.ref),
    getCustomerRecency(c.merchant.id, c.ref),
    db.sale.findMany({ where: { merchantId: c.merchant.id, customerId: c.customerId }, orderBy: { saleDate: "desc" }, take: 6, select: { saleDate: true, netAmount: true, paymentMethod: true, paymentStatus: true } }),
  ]);
  if (!ledger) return [];
  const a = ledger.account;
  const me = recency.find((r) => r.customerId === c.customerId);
  return [
    `Asked-about customer ${ledger.customer.displayName}: ${me?.daysSinceLastPurchase != null ? `last bought ${me.lastPurchaseDate} (${me.daysSinceLastPurchase} days ago), ${me.segment.replaceAll("_", " ").toLowerCase()}` : "has not bought yet"}`,
    `${ledger.customer.displayName} udhaar: balance ${rs(a.balancePaise)}, overdue ${rs(a.overduePaise)}${a.daysOverdue > 0 ? ` for ${a.daysOverdue} days` : ""}${a.nextDueDate ? `, next due ${a.nextDueDate}` : ""}`,
    `${ledger.customer.displayName} ledger, latest first: ${list(ledger.lines.slice(-8).reverse().map((l) => `${day(l.entryDate)} ${l.type.replaceAll("_", " ").toLowerCase()} ${rs(l.amountPaise)}${l.note ? ` (${l.note})` : ""}`))}`,
    `${ledger.customer.displayName} purchases, latest first: ${list(sales.map((s) => `${day(s.saleDate)} ${rs(Math.round(s.netAmount.toNumber() * 100))} ${s.paymentMethod} ${s.paymentStatus}`))}`,
  ];
}

const MAX_SOURCES = 4;

/** Slices a question calls for: matched by words in the question or the previous question (follow-ups), best first. */
export function pickSources(question: string, previous = ""): DataSource[] {
  const text = `${question} ${previous}`;
  const scored = DATA_SOURCES.map((s) => ({ s, hits: (question.match(new RegExp(s.match.source, "gi")) ?? []).length * 2 + (text.match(new RegExp(s.match.source, "gi")) ?? []).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, MAX_SOURCES)
    .map((x) => x.s);
  // Nothing recognised: give the model the brief view of everything rather than a blank, so it can still find the answer.
  return scored.length ? scored : DATA_SOURCES.filter((s) => s.brief);
}

const cache = new Lru<{ at: number; lines: string[] }>(200);

async function loadSource(s: DataSource, c: Ctx): Promise<string[]> {
  // The demo store's date is pinned, so its numbers never change; real shops reuse results only for a short time.
  const ttl = s.cacheSeconds === 0 ? 0 : c.merchant.isDemo ? 3_600_000 : s.cacheSeconds * 1000;
  const key = `${c.merchant.id}:${s.id}:${c.ref}`;
  const hit = ttl ? cache.get(key) : undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.lines;
  const lines = await s.load(c).catch((e) => (console.error(`voice data source ${s.id} failed:`, e), [] as string[]));
  if (ttl && lines.length) cache.set(key, { at: Date.now(), lines });
  return lines;
}

/** The fact lines for one question, plus which slices were read (for debugging). */
export async function factSheet(merchant: Merchant, question: string, previous = "", customerId?: string): Promise<{ facts: string; sources: string[] }> {
  const ref = referenceDateFor(merchant);
  const ctx: Ctx = {
    merchant,
    ref,
    customerId,
    range: (key) => resolveRange(key === "today" ? { range: "custom", from: ref, to: ref } : { range: key }, ref).range,
  };
  const picked = pickSources(question, previous);
  const [parts, who] = await Promise.all([Promise.all(picked.map((s) => loadSource(s, ctx))), customerLines(ctx).catch(() => [] as string[])]);
  return { facts: [`Shop: ${merchant.shopName}. Today is ${ref}.`, ...who, ...parts.flat()].join("\n"), sources: picked.map((s) => s.id) };
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

const LANG_RULE: Record<VoiceLanguage, string> = {
  HINDI: "Reply in simple Hindi written in Devanagari script.",
  HINGLISH: "Reply in Hinglish: everyday Hindi written in Roman (English) letters, like a shopkeeper talks.",
  ENGLISH: "Reply in simple Indian English.",
};

const SYSTEM = (language: VoiceLanguage) =>
  [
    "You are DukaanIQ, a friendly assistant for a small Indian shop owner. Answer the owner's question about their own shop.",
    "The FACTS below were just read from the shop's live records (customers, sales, transactions, products, udhaar ledger, proposals) for this question. You have this data: use it, and never tell the owner to open a page for something the facts contain.",
    "Copy every name, rupee amount, count and date exactly as written in the facts; never calculate new totals, percentages or estimates.",
    "When asked for a number of names or items ('five names'), give exactly that many from the facts, in the order listed, comma separated.",
    "Only if the facts truly do not contain the answer, say so in one short sentence and name the app page that does (Dashboard, Customers, Transactions, Udhaar, Growth Tips, Action Centre).",
    "Use the recent conversation to understand follow-up questions such as 'and last week?' or 'uska kitna?'.",
    "You cannot save, send or approve anything; if asked to, say the owner must do it on screen.",
    "Keep it short: at most 3 sentences or one list, no markdown, no bullet symbols.",
    LANG_RULE[language],
  ].join("\n");

export async function askData(merchant: Merchant, question: string, language: VoiceLanguage, history: Turn[], customerId?: string): Promise<string | null> {
  const { facts } = await factSheet(merchant, question, history.at(-1)?.user ?? "", customerId);
  const convo = history.slice(-3).map((t) => `Owner: ${t.user}\nYou: ${t.assistant}`).join("\n");
  const reply = await sarvamChat({
    model: env.SARVAM_CHAT_MODEL,
    system: `${SYSTEM(language)}\n\nFACTS:\n${facts}`,
    user: `${convo ? `Recent conversation:\n${convo}\n\n` : ""}Question: ${question.slice(0, 300)}`,
    maxTokens: 400,
    temperature: 0.2,
    timeoutMs: 12_000,
  });
  if (!reply) return null;
  return usesOnlyKnownNumbers(reply, `${facts}\n${question}\n${convo}`) ? reply.slice(0, 600) : null;
}
