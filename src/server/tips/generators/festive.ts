import { comboPrice, scenarioEconomics } from "../economics";
import { upcomingFestivals, type Festival } from "../festivals";
import type { DailyPoint, TipContext, TipFeedback } from "../types";
import { activeOrCooling, addDays, audienceFlags, audienceOf, buildCoupon, dateText, daysUntil, rupeesText, type Built } from "./shared";

/**
 * FESTIVE (merchant priority #2): a festival from festivals.ts starts 3-21 days after the reference date.
 * Audience = opted-in ACTIVE + COOLING_OFF customers (never opted-out ones). Offer = a coupon or a combo on the
 * festival's categories that this shop actually sold in the last 90 days. Valid from 3 days before the
 * festival (or tomorrow) to its last day. Evidence compares past festival weeks inside the data with a baseline.
 */
export function festiveCandidates(ctx: TipContext, fb: TipFeedback): Built[] {
  const soldCats = new Set(ctx.products.filter((p) => p.qty90 > 0 && p.category).map((p) => p.category as string));
  const fests = upcomingFestivals(ctx.festivals, ctx.ref, (f) => daysUntil(ctx, f.startDate)).filter((f) => !fb.excludeFestivals.includes(f.key));
  const pool = ctx.customers.filter((c) => c.optedIn && activeOrCooling(c)).sort((a, b) => b.spend90Paise - a.spend90Paise || a.id.localeCompare(b.id));
  const audience = audienceOf(pool, fb);
  if (audience.length < 3) return [];
  // Most recent past festival first: it is the closest comparison.
  const uplift = pastUplift(ctx.daily, ctx.festivals, ctx.ref).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const upliftFacts = uplift.length
    ? uplift.map((u) => `${u.festival} (${dateText(u.startDate)} to ${dateText(u.endDate)}): daily sales ${rupeesText(u.avgDailySalesPaise)} vs ${rupeesText(u.baselineAvgDailySalesPaise)} in the 4 weeks before (${u.upliftPct >= 0 ? "+" : ""}${u.upliftPct}%).`)
    : ["No past festival in the sales data to compare with."];

  return fests.flatMap((f, idx): Built[] => {
    const cats = f.relevantCategories.filter((c) => soldCats.has(c) && !fb.excludeCategories.includes(c));
    if (cats.length === 0) return [];
    const from = [addDays(ctx.ref, 1 + fb.validityShiftDays), addDays(f.startDate, -3)].sort()[1];
    const window = { validFrom: from, validTill: f.endDate };
    if (window.validFrom > window.validTill) return [];
    const days = daysUntil(ctx, f.startDate);
    const catRevenue = Object.fromEntries(
      cats.map((c) => [c, ctx.products.filter((p) => p.category === c).reduce((t, p) => t + p.revenue90Paise, 0)] as const).sort((a, b) => b[1] - a[1]),
    );
    const topCats = Object.keys(catRevenue).slice(0, 3);
    const evidence = {
      festival: f.name,
      festivalDates: `${f.startDate} to ${f.endDate}`,
      daysUntilFestival: days,
      categories: cats,
      categoryRevenue90: Object.fromEntries(Object.entries(catRevenue).map(([k, v]) => [k, rupeesText(v)])),
      pastFestivals: uplift.length ? uplift : "No past festival in data",
      rule: "Opted-in customers who bought in the last 30 days",
      asOf: ctx.ref,
      ...audienceFlags(audience),
    };
    const facts = [
      `${f.name} starts on ${dateText(f.startDate)}, in ${days} days.`,
      `Your top festival categories in the last 90 days: ${topCats.map((c) => `${c} ${rupeesText(catRevenue[c])}`).join(", ")}.`,
      ...upliftFacts,
      `${audience.length} opted-in customers bought in the last 30 days.`,
    ];
    const nearness = Math.max(0, 6 - Math.abs(days - 7) / 2) - idx;
    const out: Built[] = [];

    const coupon = buildCoupon(ctx, fb, { prefix: "FEST", ceilingPct: 10, categories: cats, audience, days: 0, window, seed: `FESTIVE:${f.key}:coupon` });
    if (coupon && coupon.offer.kind === "COUPON") {
      const o = coupon.offer;
      out.push({
        key: `FESTIVE:${f.key}:coupon`,
        family: "FESTIVE",
        type: "FESTIVE",
        quality: 4 + nearness,
        title: `${f.name} offer: ${o.discountPct}% off ${topCats.join(", ")}${cats.length > topCats.length ? " and more" : ""} for ${audience.length} customers`,
        why: `${facts[0]} ${facts[1]} ${upliftFacts[0]} A festive coupon (${o.discountPct}% off up to ${rupeesText(o.capPaise)}) from ${dateText(o.validFrom)} to ${dateText(o.validTill)} brings festival shopping to your shop.`,
        whyFacts: [...facts, `Offer: ${o.discountPct}% off up to ${rupeesText(o.capPaise)}, minimum bill ${rupeesText(o.minSpendPaise)}, valid ${dateText(o.validFrom)} to ${dateText(o.validTill)}.`],
        messageKind: "FESTIVE",
        festivalName: f.name,
        offer: o,
        audience,
        audienceRule: "segment",
        categories: cats,
        productIds: [],
        evidence,
        economics: coupon.economics,
        changes: [],
      });
    }

    const combo = festiveCombo(ctx, fb, cats);
    if (combo) {
      const names = combo.items.map((i) => i.name).join(" + ");
      const cost = combo.items.reduce((t, i) => t + i.costPaise, 0);
      out.push({
        key: `FESTIVE:${f.key}:combo`,
        family: "FESTIVE",
        type: "FESTIVE",
        quality: 2 + nearness,
        title: `${f.name} combo: ${names} for ${rupeesText(combo.price.comboPricePaise)}`,
        why: `${facts[0]} ${upliftFacts[0]} A festive combo of ${names} at ${rupeesText(combo.price.comboPricePaise)} (list ${rupeesText(combo.price.listPricePaise)}) keeps at least ${ctx.minMarginPct}% over cost.`,
        whyFacts: [...facts, `Combo: ${names} for ${rupeesText(combo.price.comboPricePaise)} instead of ${rupeesText(combo.price.listPricePaise)}.`],
        messageKind: "FESTIVE",
        festivalName: f.name,
        offer: { kind: "COMBO", items: combo.items, ...combo.price, ...window, usageLimitPerCustomer: 2 },
        audience,
        audienceRule: "segment",
        categories: [...new Set(combo.cats)],
        productIds: combo.items.map((i) => i.productId),
        evidence: { ...evidence, comboBasis: combo.basis },
        economics: scenarioEconomics(
          { audienceSize: audience.length, basketPaise: combo.price.listPricePaise, costRate: cost / combo.price.listPricePaise, discountPerRedemptionPaise: combo.price.listPricePaise - combo.price.comboPricePaise },
          [`Combo price stays at or above cost + ${ctx.minMarginPct}%.`],
        ),
        changes: [],
      });
    }
    return out;
  });
}

function festiveCombo(ctx: TipContext, fb: TipFeedback, cats: string[]) {
  const usable = ctx.products.filter((p) => p.category && cats.includes(p.category) && p.qty90 > 0 && !fb.excludeProductIds.includes(p.id));
  const byId = new Map(usable.map((p) => [p.id, p]));
  const pair = ctx.pairs.list.find((x) => byId.has(x.a) && byId.has(x.b));
  const chosen = pair ? [byId.get(pair.a)!, byId.get(pair.b)!] : [...usable].sort((a, b) => b.revenue90Paise - a.revenue90Paise).slice(0, 2);
  if (chosen.length < 2) return null;
  const items = chosen.map((p) => ({ productId: p.id, name: p.name, pricePaise: p.pricePaise, costPaise: p.costPaise }));
  const price = comboPrice(items, Math.min(8, fb.maxDiscountPct ?? 8), ctx.minMarginPct);
  if (!price) return null;
  return { items, price, cats: chosen.map((p) => p.category as string), basis: pair ? `Bought together in ${pair.support} sales` : "Top sellers in the festival categories (last 90 days)" };
}

export type Uplift = { festival: string; startDate: string; endDate: string; avgDailySalesPaise: number; baselineAvgDailySalesPaise: number; upliftPct: number };

/** Average daily sales during each past festival inside the data vs the 28 days before it. */
export function pastUplift(daily: DailyPoint[], festivals: Festival[], ref: string): Uplift[] {
  if (daily.length === 0) return [];
  const byDate = new Map(daily.map((d) => [d.date, d.netSalesPaise]));
  const first = daily[0].date;
  const avg = (from: string, to: string) => {
    let t = 0;
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      t += byDate.get(d) ?? 0;
      n++;
    }
    return n ? Math.round(t / n) : 0;
  };
  return festivals
    .filter((f) => f.endDate < ref && addDays(f.startDate, -28) >= first)
    .map((f) => {
      const fest = avg(f.startDate, f.endDate);
      const base = avg(addDays(f.startDate, -28), addDays(f.startDate, -1));
      return { festival: f.name, startDate: f.startDate, endDate: f.endDate, avgDailySalesPaise: fest, baselineAvgDailySalesPaise: base, upliftPct: base ? Math.round((fest / base - 1) * 100) : 0 };
    });
}
