import { formatLocalDate } from "@/lib/money";
import { addDays, daysBetween } from "@/server/analytics/range";
import { rupeesText, type Language } from "@/server/recommendations/text";
import { maxDiscountPct, pickDiscountPct, productsAboveFloor, roundDownTo, roundUpTo, scenarioEconomics } from "../economics";
import type { AudienceMember, Candidate, CustomerFact, Offer, ProductFact, TimeWindow, TipContext, TipFeedback } from "../types";

export { addDays, daysBetween, formatLocalDate, rupeesText };

export const isReachable = (c: CustomerFact) => !c.optedOut;

export const toMember = (c: CustomerFact): AudienceMember => ({
  customerId: c.id,
  name: c.name,
  language: c.language,
  lastPurchaseDate: c.lastPurchaseDate,
  daysSince: c.daysSince,
  optedIn: c.optedIn,
  synthetic: c.synthetic,
});

/**
 * Audience for a customer-messaging tip: never opted-out customers, never customers the merchant excluded,
 * ordered by the caller's priority and shrunk by COST_TOO_HIGH steps (each halves it, keeping the top).
 */
export function audienceOf(list: CustomerFact[], fb: TipFeedback, minSize = 1): AudienceMember[] {
  const excluded = new Set(fb.excludeCustomerIds);
  let picked = list.filter((c) => isReachable(c) && !excluded.has(c.id));
  for (let i = 0; i < fb.audienceShrink && picked.length > minSize * 2; i++) picked = picked.slice(0, Math.ceil(picked.length / 2));
  return picked.map(toMember);
}

export const activeOrCooling = (c: CustomerFact) => c.segment === "ACTIVE" || c.segment === "COOLING_OFF";

/** Loyal = top 20% by 90-day spend (rule "spend") or at least N paid orders in 90 days (rule "frequency"); currently active or cooling off. */
export function loyalCustomers(ctx: TipContext, rule: "spend" | "frequency"): CustomerFact[] {
  const buyers = ctx.customers.filter((c) => c.orders90 > 0 && activeOrCooling(c));
  if (rule === "spend") {
    const sorted = [...buyers].sort((a, b) => b.spend90Paise - a.spend90Paise || a.id.localeCompare(b.id));
    return sorted.slice(0, Math.max(1, Math.ceil(ctx.customers.filter((c) => c.orders90 > 0).length * 0.2)));
  }
  return buyers.filter((c) => c.orders90 >= frequencyThreshold(ctx)).sort((a, b) => b.orders90 - a.orders90 || b.spend90Paise - a.spend90Paise || a.id.localeCompare(b.id));
}

/** At least 4 orders, or the 80th percentile of 90-day order counts when that is higher. */
export function frequencyThreshold(ctx: TipContext): number {
  const counts = ctx.customers.map((c) => c.orders90).filter((n) => n > 0).sort((a, b) => a - b);
  const p80 = counts[Math.floor(counts.length * 0.8)] ?? 0;
  return Math.max(4, p80);
}

export const RULE_TEXT = {
  spend: "Top 20% of customers by spend in the last 90 days, who bought in the last 30 days",
  frequency: "Customers with the most paid orders in the last 90 days, who bought in the last 30 days",
} as const;

/** The audience's most common preferred language (ties: Hinglish, Hindi, English). One message per recommendation. */
export function majorityLanguage(a: AudienceMember[]): Language {
  const order: Language[] = ["HINGLISH", "HINDI", "ENGLISH"];
  const n = (l: Language) => a.filter((m) => m.language === l).length;
  return order.reduce((best, l) => (n(l) > n(best) ? l : best), order[0]);
}

export const avgAov = (a: AudienceMember[], ctx: TipContext) => {
  const byId = new Map(ctx.customers.map((c) => [c.id, c]));
  const vals = a.map((m) => byId.get(m.customerId)?.aov90Paise ?? 0).filter((v) => v > 0);
  return vals.length ? Math.round(vals.reduce((t, v) => t + v, 0) / vals.length) : ctx.shop.aov90Paise;
};

/** Validity window starting tomorrow, shifted later by BAD_TIMING feedback. */
export function validity(ctx: TipContext, days: number, fb: TipFeedback) {
  const from = addDays(ctx.ref, 1 + fb.validityShiftDays);
  return { validFrom: from, validTill: addDays(from, days - 1) };
}

/** Product cost as a share of 90-day revenue for the given categories (catalog prices when there were no sales). */
export function costRateFor(products: ProductFact[]): number {
  const rev = products.reduce((t, p) => t + p.revenue90Paise, 0);
  if (rev > 0) return (rev - products.reduce((t, p) => t + p.profit90Paise, 0)) / rev;
  const price = products.reduce((t, p) => t + p.pricePaise, 0);
  return price > 0 ? products.reduce((t, p) => t + p.costPaise, 0) / price : 1;
}

type CouponArgs = {
  prefix: string;
  ceilingPct: number;
  categories: string[] | "ALL";
  audience: AudienceMember[];
  days: number;
  timeWindow?: TimeWindow | null;
  /** Fixed dates (festivals); otherwise `days` from tomorrow. */
  window?: { validFrom: string; validTill: string };
  codeMode: "UNIQUE_PER_CUSTOMER" | "SHARED";
  /** A discount the merchant asked for by name. Skips the ladder but not the margin floor: products that cannot carry it are excluded. */
  exactPct?: number;
};

/**
 * A coupon that respects the margin floor at basket level (category cost rate) and per product
 * (products that cannot carry the discount are excluded and listed). Returns null if no step fits.
 */
export function buildCoupon(ctx: TipContext, fb: TipFeedback, a: CouponArgs) {
  const excludedCats = new Set(fb.excludeCategories);
  const inScope = ctx.products.filter((p) => !fb.excludeProductIds.includes(p.id) && (a.categories === "ALL" ? !excludedCats.has(p.category ?? "") : a.categories.includes(p.category ?? "")));
  if (inScope.length === 0 || a.audience.length === 0) return null;
  const costRate = costRateFor(inScope);
  const basketAllowed = maxDiscountPct(10_000, Math.round(costRate * 10_000), ctx.minMarginPct);
  const pct = a.exactPct ?? pickDiscountPct(basketAllowed, Math.min(a.ceilingPct, fb.maxDiscountPct ?? Infinity));
  if (pct === null) return null;
  const eligible = productsAboveFloor(inScope, pct, ctx.minMarginPct);
  if (eligible.length === 0) return null;
  const aov = avgAov(a.audience, ctx);
  const minSpendPaise = Math.max(10_000, roundDownTo(aov, 5_000));
  const capPaise = Math.max(1_000, roundUpTo(Math.round((Math.max(aov, minSpendPaise) * pct) / 100), 1_000));
  const basket = Math.max(aov, minSpendPaise);
  const discountPerRedemption = Math.min(Math.round((basket * pct) / 100), capPaise);
  const { validFrom, validTill } = a.window ?? validity(ctx, a.days, fb);
  const offer: Offer = {
    kind: "COUPON",
    codeMode: a.codeMode,
    codePrefix: `${a.prefix}${pct}`,
    discountPct: pct,
    capPaise,
    minSpendPaise,
    eligibleCategories: a.categories === "ALL" ? (excludedCats.size ? [...new Set(inScope.flatMap((p) => (p.category ? [p.category] : [])))].sort() : "ALL") : a.categories,
    excludedProducts: inScope.filter((p) => !eligible.includes(p)).map((p) => p.name),
    validFrom,
    validTill,
    timeWindow: a.timeWindow ?? null,
    usageLimitPerCustomer: 1,
  };
  const economics = scenarioEconomics(
    { audienceSize: a.audience.length, basketPaise: basket, costRate, discountPerRedemptionPaise: discountPerRedemption },
    [`Margin floor: price after discount stays at or above cost + ${ctx.minMarginPct}%. Products that cannot carry ${pct}% are excluded.`],
  );
  return { offer, economics, pct, costRate, aov };
}

export const offerTermsOf = (offer: Offer, changes: string[]) => ({ ...offer, changesFromPrevious: changes });

export type Built = Omit<Candidate, "score"> & { quality: number };

/** Shared audience flags for the evidence block (flagged, not silently dropped). */
export const audienceFlags = (a: AudienceMember[]) => ({
  audienceSize: a.length,
  notOptedIn: a.filter((m) => !m.optedIn).length,
  demoCustomers: a.filter((m) => m.synthetic).length,
});

export const daysUntil = (ctx: TipContext, ymd: string) => daysBetween(ctx.ref, ymd);
export const dateText = (ymd: string) => formatLocalDate(ymd);
