import { maxDiscountPct } from "./economics";
import { audienceFlags, audienceOf, buildCoupon, dateText, loyalCustomers, rupeesText } from "./generators/shared";
import { emptyFeedback, type Candidate, type CustomerFact, type TipContext } from "./types";

/**
 * A discount the shop owner asked for ("25% off for loyal customers"). The owner chooses the percentage and the
 * group; the code still decides who is in the group, whether the margin floor allows it, and every figure.
 * Products that cannot carry the discount above the margin floor are excluded and listed; if none can, no offer is made.
 */

export const OFFER_AUDIENCES = ["LOYAL", "INACTIVE", "COOLING", "ACTIVE", "ALL"] as const;
export type OfferAudience = (typeof OFFER_AUDIENCES)[number];
export const MAX_CUSTOM_DISCOUNT_PCT = 50;

export type CustomOfferInput = { discountPct: number; audience: OfferAudience; days?: number };

export const AUDIENCE_LABEL: Record<OfferAudience, string> = {
  LOYAL: "loyal customers",
  INACTIVE: "customers who stopped coming",
  COOLING: "customers who have not visited in 2 to 4 weeks",
  ACTIVE: "active customers",
  ALL: "customers who have bought before",
};

const RULE: Record<OfferAudience, string> = {
  LOYAL: "Top 20% of customers by spend in the last 90 days, who bought in the last 30 days",
  INACTIVE: "No paid purchase for more than 30 days, with at least one paid order in the last 180 days",
  COOLING: "Last paid purchase 15 to 30 days ago",
  ACTIVE: "Paid purchase in the last 14 days",
  ALL: "Every customer who has bought before",
};

const pool = (ctx: TipContext, a: OfferAudience): CustomerFact[] => {
  const spend = (x: CustomerFact, y: CustomerFact) => y.spend90Paise - x.spend90Paise || x.id.localeCompare(y.id);
  switch (a) {
    case "LOYAL":
      return loyalCustomers(ctx, "spend");
    case "INACTIVE":
      return ctx.customers.filter((c) => c.segment === "INACTIVE" && c.orders180 >= 1).sort(spend);
    case "COOLING":
      return ctx.customers.filter((c) => c.segment === "COOLING_OFF").sort(spend);
    case "ACTIVE":
      return ctx.customers.filter((c) => c.segment === "ACTIVE").sort(spend);
    case "ALL":
      return ctx.customers.filter((c) => c.segment !== "NO_PURCHASE").sort(spend);
  }
};

export type CustomOffer = { ok: true; candidate: Candidate } | { ok: false; error: string };

export function buildCustomOffer(ctx: TipContext, input: CustomOfferInput): CustomOffer {
  const pct = Math.round(input.discountPct);
  if (!Number.isFinite(pct) || pct < 1 || pct > MAX_CUSTOM_DISCOUNT_PCT) return { ok: false, error: `Choose a discount between 1% and ${MAX_CUSTOM_DISCOUNT_PCT}%.` };
  const label = AUDIENCE_LABEL[input.audience];
  const audience = audienceOf(pool(ctx, input.audience), emptyFeedback());
  if (audience.length === 0) return { ok: false, error: `No ${label} to send this to right now.` };
  const days = Math.min(30, Math.max(1, input.days ?? 14));
  const codeMode = input.audience === "ALL" ? "SHARED" : "UNIQUE_PER_CUSTOMER";
  const coupon = buildCoupon(ctx, emptyFeedback(), { prefix: "OFFER", ceilingPct: pct, exactPct: pct, categories: "ALL", audience, days, codeMode });
  if (!coupon || coupon.offer.kind !== "COUPON") {
    const room = Math.max(0, ...ctx.products.map((p) => maxDiscountPct(p.pricePaise, p.costPaise, ctx.minMarginPct)));
    return { ok: false, error: room > 0 ? `${pct}% off is too much: no product keeps your minimum ${ctx.minMarginPct}% margin at that discount. The most your margins allow is ${room}%.` : `Your margins leave no room for a discount at the minimum ${ctx.minMarginPct}% margin.` };
  }
  const o = coupon.offer;
  const winback = input.audience === "INACTIVE";
  const facts = [
    `${audience.length} ${label} (${RULE[input.audience].toLowerCase()}).`,
    `Offer you asked for: ${pct}% off up to ${rupeesText(o.capPaise)} per bill, minimum bill ${rupeesText(o.minSpendPaise)}, valid till ${dateText(o.validTill)}.`,
    ...(o.excludedProducts.length ? [`${o.excludedProducts.length} product${o.excludedProducts.length === 1 ? "" : "s"} left out so that every sale keeps at least ${ctx.minMarginPct}% margin.`] : []),
  ];
  return {
    ok: true,
    candidate: {
      key: `CUSTOM:${input.audience}:${pct}`,
      family: winback ? "WINBACK" : "LOYALTY",
      type: winback ? "WINBACK" : "LOYALTY",
      score: 0,
      title: `${pct}% off for ${audience.length} ${label}`,
      why: `You asked for ${pct}% off for ${label}. ${facts[0]} ${facts[1]}${facts[2] ? ` ${facts[2]}` : ""}`,
      whyFacts: facts,
      messageKind: winback ? "WINBACK" : "OFFER",
      festivalName: null,
      offer: o,
      audience,
      audienceRule: "segment",
      categories: [],
      productIds: [],
      evidence: { rule: RULE[input.audience], requestedBy: "merchant (voice or typed)", requestedDiscountPct: pct, asOf: ctx.ref, ...audienceFlags(audience) },
      economics: coupon.economics,
      changes: [],
    },
  };
}
