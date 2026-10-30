import { formatLocalDate } from "@/lib/money";
import type { Draft } from "@/server/recommendations/draft";
import { reminderContent } from "@/server/recommendations/reminder-content";
import { comboSavingText, discountText, minSpendText, rupeesText, templateMessage, timeWindowText, type ComposedMessage, type MessageFacts, type Tone } from "@/server/recommendations/text";
import { codePreview } from "@/server/recommendations/coupons";
import { majorityLanguage } from "./generators/shared";
import type { Candidate, Offer } from "./types";

/** Candidate → the exact, pre-formatted facts a text provider may use. null for in-store tips (no customer message). */
export function factsFor(c: Candidate, shopName: string, tone: Tone = "standard"): MessageFacts | null {
  if (!c.messageKind) return null;
  const base = { language: majorityLanguage(c.audience), tone, shopName };
  const o = c.offer;
  const l = base.language;
  if (c.messageKind === "CREDIT_REMINDER" && o.kind === "REMINDER") return { ...base, kind: "CREDIT_REMINDER", amountRupees: rupeesText(o.amountPaise), dueDate: formatLocalDate(o.dueDate) };
  if (c.messageKind === "LOYALTY_CREDIT" && o.kind === "CREDIT_LIMIT") return { ...base, kind: "LOYALTY_CREDIT", creditLimitText: rupeesText(o.limits[0]?.limitPaise ?? 0) };
  if (o.kind === "COUPON") {
    const bits = { offer: "coupon" as const, discountText: discountText(o.discountPct, o.capPaise, l), minSpendText: minSpendText(o.minSpendPaise, l), codeMode: o.codeMode, validTill: formatLocalDate(o.validTill) };
    if (c.messageKind === "LOYALTY_COUPON") return { ...base, ...bits, kind: "LOYALTY_COUPON" };
    if (c.messageKind === "WINBACK") return { ...base, ...bits, kind: "WINBACK" };
    if (c.messageKind === "OFFER") return { ...base, ...bits, kind: "OFFER" };
    if (c.messageKind === "FESTIVE") return { ...base, ...bits, kind: "FESTIVE", festivalName: c.festivalName ?? "" };
    if (c.messageKind === "OFF_PEAK" && o.timeWindow) return { ...base, ...bits, kind: "OFF_PEAK", timeWindowText: timeWindowText(o.timeWindow.dow, o.timeWindow.startHour, o.timeWindow.endHour, l) };
  }
  if (o.kind === "COMBO") {
    const bits = {
      offer: "combo" as const,
      comboText: o.items.map((i) => i.name).join(" + "),
      comboPriceText: rupeesText(o.comboPricePaise),
      comboSavingText: comboSavingText(o.listPricePaise - o.comboPricePaise, l),
      validTill: formatLocalDate(o.validTill),
    };
    if (c.messageKind === "LOYALTY_COMBO") return { ...base, ...bits, kind: "LOYALTY_COMBO" };
    if (c.messageKind === "BUNDLE") return { ...base, ...bits, kind: "BUNDLE" };
    if (c.messageKind === "FESTIVE") return { ...base, ...bits, kind: "FESTIVE", festivalName: c.festivalName ?? "" };
  }
  return null;
}

/** Plain-language offer terms for the approval screen (PRD 7.1), from the same deterministic values. */
export function offerLines(o: Offer): string[] {
  const dates = (a: string, b: string) => `Valid ${formatLocalDate(a)} to ${formatLocalDate(b)}`;
  switch (o.kind) {
    case "COUPON":
      return [
        o.codeMode === "UNIQUE_PER_CUSTOMER"
          ? `Coupon: a unique code for each customer (${codePreview(o.codePrefix, o.codeMode)}), created only after you approve`
          : `Coupon: one shared code for all customers (${codePreview(o.codePrefix, o.codeMode)}), created only after you approve`,
        `${o.discountPct}% off, up to ${rupeesText(o.capPaise)} per bill`,
        `Minimum bill ${rupeesText(o.minSpendPaise)}`,
        o.eligibleCategories === "ALL" ? "All categories" : `Categories: ${o.eligibleCategories.join(", ")}`,
        ...(o.excludedProducts.length ? [`Excluded (margin floor): ${o.excludedProducts.join(", ")}`] : []),
        dates(o.validFrom, o.validTill),
        ...(o.timeWindow ? [`Only ${timeWindowText(o.timeWindow.dow, o.timeWindow.startHour, o.timeWindow.endHour, "ENGLISH")}`] : []),
        `${o.usageLimitPerCustomer} use per customer`,
      ];
    case "COMBO":
      return [`Combo: ${o.items.map((i) => i.name).join(" + ")}`, `Combo price ${rupeesText(o.comboPricePaise)} (list ${rupeesText(o.listPricePaise)})`, dates(o.validFrom, o.validTill), `Up to ${o.usageLimitPerCustomer} per customer`];
    case "CREDIT_LIMIT":
      return [`Udhaar limit ${rupeesText(o.limits[0]?.limitPaise ?? 0)} per customer`, `Maximum exposure ${rupeesText(o.maxExposurePaise)} (risk, not revenue)`, "Approval records the offer only; no credit entry is created"];
    case "REMINDER":
      return [`Amount ${rupeesText(o.amountPaise)}, oldest due ${formatLocalDate(o.dueDate)}`];
    case "NONE":
      return [o.action];
  }
}

function whatIf(c: Candidate, isDemo: boolean): string {
  if (c.family === "CREDIT_REMINDER") {
    const e = c.evidence as { balancePaise: number; overduePaise: number; pastGracePaise: number; daysOverdue: number; graceDays: number; asOf: string };
    return reminderContent({ name: c.audience[0]?.name ?? "the customer", ...e, ref: e.asOf, isDemo }).whatIf;
  }
  if (!c.messageKind) return "This is an in-store tip: no customer is contacted. Approving records that you plan to act on it.";
  const base = `If you approve, DukaanIQ prepares this exact message for ${c.audience.length} customer${c.audience.length === 1 ? "" : "s"}. Running it records a simulated send${isDemo ? " (demo store)" : ""}: no real message is sent.`;
  return c.offer.kind === "CREDIT_LIMIT" ? `${base} Approving only records the offer; no credit is given until you add it in the Udhaar ledger.` : base;
}

export type Wording = ComposedMessage & { why: string };

export const templateWording = (c: Candidate, facts: MessageFacts | null): Wording => ({ message: facts ? templateMessage(facts) : "", why: c.why, source: "template" });

/** Candidate + wording → Draft for submitDrafts(). The tip key and session go into evidence so feedback and alternatives can find it. */
export function draftFor(c: Candidate, w: Wording, facts: MessageFacts | null, o: { isDemo: boolean; sessionId: string | null }): Draft {
  return {
    type: c.type,
    title: c.title,
    explanation: `${w.why}\n\n${whatIf(c, o.isDemo)}`,
    evidence: JSON.parse(JSON.stringify({ ...c.evidence, highlights: c.whyFacts, messageSource: w.source, tip: { key: c.key, family: c.family, sessionId: o.sessionId, audienceRule: c.audienceRule } })),
    offerTerms: JSON.parse(JSON.stringify({ summary: offerLines(c.offer), ...c.offer, changesFromPrevious: c.changes })),
    economics: JSON.parse(JSON.stringify(c.economics)),
    message: w.message,
    language: facts?.language ?? majorityLanguage(c.audience),
    channel: c.messageKind ? "WHATSAPP_MANUAL_LINK" : "IN_APP",
    audience: c.audience.map((a) => ({ customerId: a.customerId, lastPurchaseAt: a.lastPurchaseDate ? new Date(`${a.lastPurchaseDate}T00:00:00Z`) : null, daysSinceLastPurchase: a.daysSince })),
  };
}

/**
 * What changed between the rejected version's stored offer terms and a rebuilt offer, in plain words.
 * An alternative with no changes is not offered (it would ask the merchant to approve the same thing again).
 */
export function describeChanges(oldTerms: Record<string, unknown>, next: Offer, oldAudience: number, newAudience: number, oldFestival?: string | null, newFestival?: string | null): string[] {
  const out: string[] = [];
  const money = (v: unknown) => rupeesText(Number(v ?? 0));
  if (oldFestival && newFestival && oldFestival !== newFestival) out.push(`Festival: ${oldFestival} → ${newFestival}`);
  if (next.kind === "COUPON") {
    if (oldTerms.discountPct !== next.discountPct) out.push(`Discount: ${String(oldTerms.discountPct)}% → ${next.discountPct}%`);
    if (oldTerms.capPaise !== next.capPaise) out.push(`Cap per bill: ${money(oldTerms.capPaise)} → ${rupeesText(next.capPaise)}`);
    if (oldTerms.minSpendPaise !== next.minSpendPaise) out.push(`Minimum bill: ${money(oldTerms.minSpendPaise)} → ${rupeesText(next.minSpendPaise)}`);
    const tw = oldTerms.timeWindow as { dow?: number; startHour?: number } | null | undefined;
    if (next.timeWindow && (tw?.dow !== next.timeWindow.dow || tw?.startHour !== next.timeWindow.startHour)) out.push(`Time slot: now ${timeWindowText(next.timeWindow.dow, next.timeWindow.startHour, next.timeWindow.endHour, "ENGLISH")}`);
    if (JSON.stringify(oldTerms.eligibleCategories) !== JSON.stringify(next.eligibleCategories)) out.push(`Categories: ${next.eligibleCategories === "ALL" ? "all" : next.eligibleCategories.join(", ")}`);
  }
  if (next.kind === "COMBO") {
    const oldItems = Array.isArray(oldTerms.items) ? (oldTerms.items as { name: string }[]).map((i) => i.name).join(" + ") : "";
    const newItems = next.items.map((i) => i.name).join(" + ");
    if (oldItems !== newItems) out.push(`Combo: ${oldItems || "none"} → ${newItems}`);
    if (oldTerms.comboPricePaise !== next.comboPricePaise) out.push(`Combo price: ${money(oldTerms.comboPricePaise)} → ${rupeesText(next.comboPricePaise)}`);
  }
  if (next.kind === "CREDIT_LIMIT") {
    const oldLimit = (oldTerms.limits as { limitPaise: number }[] | undefined)?.[0]?.limitPaise;
    if (oldLimit !== next.limits[0]?.limitPaise) out.push(`Udhaar limit: ${money(oldLimit)} → ${rupeesText(next.limits[0]?.limitPaise ?? 0)}`);
  }
  if ("validFrom" in next && oldTerms.validFrom !== next.validFrom) out.push(`Starts: ${formatLocalDate(String(oldTerms.validFrom))} → ${formatLocalDate(next.validFrom)}`);
  if (oldAudience !== newAudience) out.push(`Audience: ${oldAudience} → ${newAudience} customers`);
  return out;
}
