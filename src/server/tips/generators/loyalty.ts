import { comboPrice, scenarioEconomics } from "../economics";
import type { ComboItem, CustomerFact, TipContext, TipFeedback } from "../types";
import { RULE_TEXT, audienceFlags, audienceOf, buildCoupon, dateText, loyalCustomers, rupeesText, validity, type Built } from "./shared";

/**
 * LOYALTY (merchant priority #1): reward the best customers.
 * Audience rule "spend" (default) = top 20% by 90-day spend; "frequency" = most paid orders in 90 days.
 * Both only include customers who bought in the last 30 days (ACTIVE or COOLING_OFF) and never opted-out ones.
 * Three separate tips: a coupon, a combo from their favourite categories, and udhaar for trusted payers.
 */
export function loyaltyCandidates(ctx: TipContext, fb: TipFeedback): Built[] {
  const rule = fb.audienceRule ?? "spend";
  const loyal = loyalCustomers(ctx, rule);
  const audience = audienceOf(loyal, fb);
  if (audience.length < 3) return [];
  const ids = new Set(audience.map((a) => a.customerId));
  const members = loyal.filter((c) => ids.has(c.id));
  const spend = members.reduce((t, c) => t + c.spend90Paise, 0);
  const share = ctx.shop.netSales90Paise ? Math.round((spend / ctx.shop.netSales90Paise) * 100) : 0;
  const avgOrders = Math.round((members.reduce((t, c) => t + c.orders90, 0) / members.length) * 10) / 10;
  const evidence = { rule: RULE_TEXT[rule], window: "Last 90 days", asOf: ctx.ref, audienceSpend90Paise: spend, shareOfSales90Pct: share, averageOrders90: avgOrders, ...audienceFlags(audience) };
  const facts = [
    `${audience.length} customers (${RULE_TEXT[rule].toLowerCase()}).`,
    `Together they spent ${rupeesText(spend)} in the last 90 days, ${share}% of your sales.`,
    `On average each placed ${avgOrders} orders in 90 days.`,
  ];
  const out: Built[] = [];

  const coupon = buildCoupon(ctx, fb, { prefix: "LOYAL", ceilingPct: 10, categories: "ALL", audience, days: 14, codeMode: "UNIQUE_PER_CUSTOMER" });
  if (coupon && coupon.offer.kind === "COUPON") {
    const o = coupon.offer;
    out.push({
      key: "LOYALTY:coupon",
      family: "LOYALTY",
      type: "LOYALTY",
      quality: 8 + Math.min(2, audience.length / 20),
      title: `Reward your ${audience.length} best customers with ${o.discountPct}% off`,
      why: `${facts[0]} ${facts[1]} A thank-you coupon (${o.discountPct}% off up to ${rupeesText(o.capPaise)}, minimum bill ${rupeesText(o.minSpendPaise)}) keeps them coming back.`,
      whyFacts: [...facts, `Offer: ${o.discountPct}% off up to ${rupeesText(o.capPaise)} on bills of ${rupeesText(o.minSpendPaise)} or more, valid till ${dateText(o.validTill)}.`],
      messageKind: "LOYALTY_COUPON",
      festivalName: null,
      offer: o,
      audience,
      audienceRule: rule,
      categories: [],
      productIds: [],
      evidence,
      economics: coupon.economics,
      changes: [],
    });
  }

  const combo = loyaltyCombo(ctx, fb, members);
  if (combo) {
    const { items, price } = combo;
    const v = validity(ctx, 14, fb);
    const names = items.map((i) => i.name).join(" + ");
    const cost = items.reduce((t, i) => t + i.costPaise, 0);
    out.push({
      key: "LOYALTY:combo",
      family: "LOYALTY",
      type: "LOYALTY",
      quality: 5 + Math.min(2, audience.length / 20),
      title: `Combo for your ${audience.length} regulars: ${names} for ${rupeesText(price.comboPricePaise)}`,
      why: `${facts[0]} Their favourite categories include ${[...new Set(items.map((i) => i.category))].join(" and ")}. A combo of ${names} at ${rupeesText(price.comboPricePaise)} (list ${rupeesText(price.listPricePaise)}) still earns at least ${ctx.minMarginPct}% over cost.`,
      whyFacts: [...facts, `Combo: ${names} for ${rupeesText(price.comboPricePaise)} instead of ${rupeesText(price.listPricePaise)}.`, `Combo cost is ${rupeesText(cost)}.`],
      messageKind: "LOYALTY_COMBO",
      festivalName: null,
      offer: { kind: "COMBO", items: items.map((i) => ({ productId: i.productId, name: i.name, pricePaise: i.pricePaise, costPaise: i.costPaise })), ...price, ...v, usageLimitPerCustomer: 2 },
      audience,
      audienceRule: rule,
      categories: [...new Set(items.map((i) => i.category))],
      productIds: items.map((i) => i.productId),
      evidence: { ...evidence, comboBasis: combo.basis },
      economics: scenarioEconomics(
        { audienceSize: audience.length, basketPaise: price.listPricePaise, costRate: cost / price.listPricePaise, discountPerRedemptionPaise: price.listPricePaise - price.comboPricePaise },
        [`Combo price stays at or above cost + ${ctx.minMarginPct}%.`],
      ),
      changes: [],
    });
  }

  return out;
}

type Item = ComboItem & { category: string };

/** Two products from the audience's top categories: the most frequent pair if one exists, else the two best sellers. */
function loyaltyCombo(ctx: TipContext, fb: TipFeedback, members: CustomerFact[]) {
  const catCount = new Map<string, number>();
  for (const m of members) if (m.topCategory && !fb.excludeCategories.includes(m.topCategory)) catCount.set(m.topCategory, (catCount.get(m.topCategory) ?? 0) + 1);
  const cats = [...catCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([c]) => c);
  if (cats.length === 0) return null;
  const usable = ctx.products.filter((p) => p.category && cats.includes(p.category) && !fb.excludeProductIds.includes(p.id) && p.qty90 > 0);
  const byId = new Map(usable.map((p) => [p.id, p]));
  const pair = ctx.pairs.list.find((x) => byId.has(x.a) && byId.has(x.b));
  const chosen = pair ? [byId.get(pair.a)!, byId.get(pair.b)!] : [...usable].sort((a, b) => b.revenue90Paise - a.revenue90Paise).slice(0, 2);
  if (chosen.length < 2) return null;
  const items: Item[] = chosen.map((p) => ({ productId: p.id, name: p.name, category: p.category ?? "", pricePaise: p.pricePaise, costPaise: p.costPaise }));
  const price = comboPrice(items, Math.min(8, fb.maxDiscountPct ?? 8), ctx.minMarginPct);
  if (!price) return null;
  const basis = pair ? `Bought together in ${pair.support} sales (${ctx.pairs.fromDate} to ${ctx.pairs.toDate})` : `Best sellers in ${cats.join(" and ")} (last 90 days)`;
  return { items, price, basis };
}
