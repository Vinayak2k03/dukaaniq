import { reminderContent } from "@/server/recommendations/reminder-content";
import { comboPrice, scenarioEconomics } from "../economics";
import type { TipContext, TipFeedback } from "../types";
import { activeOrCooling, audienceFlags, audienceOf, buildCoupon, dateText, rupeesText, toMember, validity, type Built } from "./shared";

/** WINBACK: INACTIVE customers (no paid purchase for more than 30 days) with at least 2 paid orders in 180 days. */
export function winbackCandidates(ctx: TipContext, fb: TipFeedback): Built[] {
  const pool = ctx.customers
    .filter((c) => c.segment === "INACTIVE" && c.orders180 >= 2)
    .sort((a, b) => b.orders180 - a.orders180 || (a.daysSince ?? 0) - (b.daysSince ?? 0) || a.id.localeCompare(b.id));
  const audience = audienceOf(pool, fb);
  if (audience.length < 3) return [];
  const coupon = buildCoupon(ctx, fb, { prefix: "MISSYOU", ceilingPct: 10, categories: "ALL", audience, days: 14, seed: "WINBACK" });
  if (!coupon || coupon.offer.kind !== "COUPON") return [];
  const o = coupon.offer;
  const days = audience.map((a) => a.daysSince ?? 0).sort((a, b) => a - b);
  const facts = [
    `${audience.length} customers with at least 2 orders in 180 days have not bought for more than 30 days.`,
    `Their last visit was ${days[0]} to ${days[days.length - 1]} days ago.`,
    `Offer: ${o.discountPct}% off up to ${rupeesText(o.capPaise)}, minimum bill ${rupeesText(o.minSpendPaise)}, till ${dateText(o.validTill)}.`,
  ];
  return [
    {
      key: "WINBACK:inactive",
      family: "WINBACK",
      type: "WINBACK",
      quality: Math.min(8, audience.length / 3),
      title: `Win back ${audience.length} customers who stopped coming`,
      why: `${facts[0]} ${facts[1]} A "we miss you" coupon is a low-cost way to bring some of them back.`,
      whyFacts: facts,
      messageKind: "WINBACK",
      festivalName: null,
      offer: o,
      audience,
      audienceRule: "segment",
      categories: [],
      productIds: [],
      evidence: { rule: "No paid purchase for more than 30 days and at least 2 paid orders in the last 180 days", asOf: ctx.ref, minDaysSince: days[0], maxDaysSince: days[days.length - 1], ...audienceFlags(audience) },
      economics: coupon.economics,
      changes: [],
    },
  ];
}

/** BUNDLE: product pairs bought together in at least 5 sales (90 days), ranked by support × combined margin. */
export function bundleCandidates(ctx: TipContext, fb: TipFeedback): Built[] {
  const byId = new Map(ctx.products.filter((p) => !fb.excludeProductIds.includes(p.id) && !fb.excludeCategories.includes(p.category ?? "")).map((p) => [p.id, p]));
  const pairs = ctx.pairs.list
    .filter((x) => x.support >= 5 && byId.has(x.a) && byId.has(x.b))
    .map((x) => ({ x, a: byId.get(x.a)!, b: byId.get(x.b)! }))
    .sort((p, q) => q.x.support * (q.a.pricePaise - q.a.costPaise + q.b.pricePaise - q.b.costPaise) - p.x.support * (p.a.pricePaise - p.a.costPaise + p.b.pricePaise - p.b.costPaise))
    .slice(0, 2);
  return pairs.flatMap(({ x, a, b }, i): Built[] => {
    const items = [a, b].map((p) => ({ productId: p.id, name: p.name, pricePaise: p.pricePaise, costPaise: p.costPaise }));
    const price = comboPrice(items, Math.min(7, fb.maxDiscountPct ?? 7), ctx.minMarginPct);
    if (!price) return [];
    const cats = [...new Set([a.category, b.category].flatMap((c) => (c ? [c] : [])))];
    const fans = ctx.customers.filter((c) => activeOrCooling(c) && c.topCategory && cats.includes(c.topCategory));
    const audience = audienceOf(fans.length >= 5 ? fans : ctx.customers.filter(activeOrCooling), fb);
    if (audience.length < 3) return [];
    const names = `${a.name} + ${b.name}`;
    const cost = a.costPaise + b.costPaise;
    const facts = [
      `${a.name} and ${b.name} were bought together in ${x.support} of ${ctx.pairs.baskets} sales (${dateText(ctx.pairs.fromDate)} to ${dateText(ctx.pairs.toDate)}).`,
      `${Math.round(x.confidenceAB * 100)}% of sales with ${a.name} also had ${b.name}.`,
      `Combo price ${rupeesText(price.comboPricePaise)} instead of ${rupeesText(price.listPricePaise)}; cost ${rupeesText(cost)}.`,
    ];
    return [
      {
        key: `BUNDLE:${x.a}:${x.b}`,
        family: "BUNDLE",
        type: "BUNDLE",
        quality: 5 - i + Math.min(3, x.support / 10),
        title: `Sell ${names} as a combo for ${rupeesText(price.comboPricePaise)}`,
        why: `${facts[0]} ${facts[1]} Pairing them at a small saving can lift basket size. This shows co-occurrence, not cause.`,
        whyFacts: facts,
        messageKind: "BUNDLE",
        festivalName: null,
        offer: { kind: "COMBO", items, ...price, ...validity(ctx, 14, fb), usageLimitPerCustomer: 2 },
        audience,
        audienceRule: "segment",
        categories: cats,
        productIds: [a.id, b.id],
        evidence: { rule: "Bought together in at least 5 paid sales in the last 90 days", support: x.support, sampleSales: ctx.pairs.baskets, confidencePct: Math.round(x.confidenceAB * 100), window: `${ctx.pairs.fromDate} to ${ctx.pairs.toDate}`, caution: "Co-occurrence, not causation", ...audienceFlags(audience) },
        economics: scenarioEconomics(
          { audienceSize: audience.length, basketPaise: price.listPricePaise, costRate: cost / price.listPricePaise, discountPerRedemptionPaise: price.listPricePaise - price.comboPricePaise },
          [`Combo price stays at or above cost + ${ctx.minMarginPct}%.`],
        ),
        changes: [],
      },
    ];
  });
}

/**
 * SLOW_MOVING: last-30-day quantity below half of the product's own monthly average over the previous 90 days
 * (which must be at least 3 units a month). In-store tip: visibility plus a combo with the category's best seller,
 * priced at or above the margin floor. No discount below the floor and no customer message.
 */
export function slowMovingCandidates(ctx: TipContext, fb: TipFeedback): Built[] {
  const slow = ctx.products
    .filter((p) => !fb.excludeProductIds.includes(p.id) && !fb.excludeCategories.includes(p.category ?? ""))
    .map((p) => ({ p, monthly: p.qtyPrior90 / 3 }))
    .filter(({ p, monthly }) => monthly >= 3 && p.qty30 < monthly * 0.5)
    .sort((x, y) => x.p.qty30 / x.monthly - y.p.qty30 / y.monthly)
    .slice(0, 1);
  return slow.flatMap(({ p, monthly }): Built[] => {
    const partner = ctx.products.filter((q) => q.id !== p.id && q.category === p.category && !fb.excludeProductIds.includes(q.id)).sort((a, b) => b.qty30 - a.qty30)[0];
    const items = partner ? [p, partner].map((q) => ({ productId: q.id, name: q.name, pricePaise: q.pricePaise, costPaise: q.costPaise })) : null;
    const price = items ? comboPrice(items, Math.min(5, fb.maxDiscountPct ?? 5), ctx.minMarginPct) : null;
    const m = Math.round(monthly * 10) / 10;
    const facts = [`${p.name} sold ${p.qty30} units in the last 30 days, against an average of ${m} a month over the 90 days before.`];
    const action = price && partner ? `Keep ${p.name} near the counter and offer it with ${partner.name} for ${rupeesText(price.comboPricePaise)} (list ${rupeesText(price.listPricePaise)}).` : `Keep ${p.name} at eye level near the counter.`;
    if (price && partner) facts.push(`Suggested combo with ${partner.name}: ${rupeesText(price.comboPricePaise)} instead of ${rupeesText(price.listPricePaise)}.`);
    return [
      {
        key: `SLOW_MOVING:${p.id}`,
        family: "SLOW_MOVING",
        type: "SLOW_MOVING",
        quality: Math.min(5, (1 - p.qty30 / monthly) * 5),
        title: `${p.name} is selling slower than usual`,
        why: `${facts[0]} ${action}`,
        whyFacts: facts,
        messageKind: null,
        festivalName: null,
        offer: { kind: "NONE", action },
        audience: [],
        audienceRule: "segment",
        categories: p.category ? [p.category] : [],
        productIds: [p.id],
        evidence: { rule: "Last 30 days below half of its own monthly average (previous 90 days)", product: p.name, qtyLast30Days: p.qty30, monthlyAverageBefore: m, asOf: ctx.ref },
        economics: { note: "No sales estimate. Any combo stays at or above the margin floor.", ...(price ? { comboPricePaise: price.comboPricePaise, listPricePaise: price.listPricePaise } : {}) },
        changes: [],
      },
    ];
  });
}

/** CREDIT_REMINDER: the same ledger rule as reminders.ts (unpaid credit past the grace period), largest amounts first. */
export function reminderCandidates(ctx: TipContext, fb: TipFeedback): Built[] {
  const customers = new Map(ctx.customers.map((c) => [c.id, c]));
  return ctx.credit
    .filter((c) => c.pastGracePaise > 0 && !fb.excludeCustomerIds.includes(c.customerId) && customers.has(c.customerId))
    .sort((a, b) => b.pastGracePaise - a.pastGracePaise || a.customerId.localeCompare(b.customerId))
    .slice(0, 3)
    .map((c, i): Built => {
      const r = reminderContent({ name: c.name, balancePaise: c.balancePaise, overduePaise: c.overduePaise, pastGracePaise: c.pastGracePaise, daysOverdue: c.daysOverdue, graceDays: ctx.graceDays, ref: ctx.ref, isDemo: ctx.merchant.isDemo });
      return {
        key: `CREDIT_REMINDER:${c.customerId}`,
        family: "CREDIT_REMINDER",
        type: "CREDIT_REMINDER",
        quality: 5 - i,
        title: r.title,
        why: r.why,
        whyFacts: [r.why],
        messageKind: "CREDIT_REMINDER",
        festivalName: null,
        offer: { kind: "REMINDER", amountPaise: c.pastGracePaise, dueDate: r.dueDate },
        audience: [toMember(customers.get(c.customerId)!)],
        audienceRule: "single",
        categories: [],
        productIds: [],
        evidence: r.evidence,
        economics: r.economics,
        changes: [],
      };
    });
}
