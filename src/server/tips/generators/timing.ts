import { averageOrders, slotsFrom, type Slot } from "@/server/analytics/insights-math";
import { timeWindowText } from "@/server/recommendations/text";
import type { TipContext, TipFeedback } from "../types";
import { activeOrCooling, audienceFlags, audienceOf, buildCoupon, dateText, rupeesText, type Built } from "./shared";

export const OFF_PEAK_RULES = { slotHours: 2, quietBelowPct: 50, busyAbovePct: 150, minWeeks: 4 } as const;

const slotKey = (s: Slot) => `${s.dow}:${s.startHour}`;
const slotLabel = (s: Slot) => timeWindowText(s.dow, s.startHour, s.endHour, "ENGLISH");

/**
 * OFF_PEAK (merchant priority #3): 2-hour weekday slots over the last 8 weeks. A slot is quiet when its orders are
 * below 50% of the shop's average open slot, the shop clearly trades then (at least one sale), and at least 4 weeks
 * were observed. Offer = a happy-hour coupon valid only in that weekday/hour window for the next 4 weeks.
 */
export function offPeakCandidates(ctx: TipContext, fb: TipFeedback): Built[] {
  const h = ctx.heatmap;
  if (h.weeksObserved < OFF_PEAK_RULES.minWeeks) return [];
  const slots = slotsFrom(h.cells, OFF_PEAK_RULES.slotHours);
  const avg = averageOrders(slots);
  const quiet = slots
    .filter((s) => s.orders > 0 && s.orders < (avg * OFF_PEAK_RULES.quietBelowPct) / 100 && !fb.excludeSlots.includes(slotKey(s)))
    .sort((a, b) => a.orders - b.orders || a.dow - b.dow || a.startHour - b.startHour)
    .slice(0, 2);
  const pool = ctx.customers.filter(activeOrCooling).sort((a, b) => b.orders90 - a.orders90 || a.id.localeCompare(b.id));
  const audience = audienceOf(pool, fb);
  if (audience.length < 3) return [];

  return quiet.flatMap((s, i): Built[] => {
    const tw = { dow: s.dow, startHour: s.startHour, endHour: s.endHour };
    const coupon = buildCoupon(ctx, fb, { prefix: "HAPPY", ceilingPct: 7, categories: "ALL", audience, days: 28, timeWindow: tw, codeMode: "SHARED" });
    if (!coupon || coupon.offer.kind !== "COUPON") return [];
    const o = coupon.offer;
    const pctOfAvg = Math.round((s.orders / avg) * 100);
    const facts = [
      `${slotLabel(s)} had ${s.orders} order${s.orders === 1 ? "" : "s"} in the last ${h.weeksObserved} weeks with sales.`,
      `Your average 2-hour slot had ${Math.round(avg * 10) / 10} orders (this slot is at ${pctOfAvg}%).`,
      `Based on ${h.totalOrders} paid orders from ${dateText(h.fromDate)} to ${dateText(h.toDate)}.`,
    ];
    return [
      {
        key: `OFF_PEAK:${slotKey(s)}`,
        family: "OFF_PEAK",
        type: "OFF_PEAK",
        quality: 6 - i + Math.min(3, (100 - pctOfAvg) / 20),
        title: `Fill quiet ${slotLabel(s)} with a ${o.discountPct}% happy-hour offer`,
        why: `${facts[0]} ${facts[1]} A coupon that only works in this window (${o.discountPct}% off up to ${rupeesText(o.capPaise)}) can move some visits from busy hours into this one.`,
        whyFacts: [...facts, `Offer: ${o.discountPct}% off up to ${rupeesText(o.capPaise)} on bills of ${rupeesText(o.minSpendPaise)} or more, only ${slotLabel(s)}, till ${dateText(o.validTill)}.`],
        messageKind: "OFF_PEAK",
        festivalName: null,
        offer: o,
        audience,
        audienceRule: "segment",
        categories: [],
        productIds: [],
        evidence: {
          rule: `2-hour slot with fewer than ${OFF_PEAK_RULES.quietBelowPct}% of the average slot's orders (min ${OFF_PEAK_RULES.minWeeks} weeks observed)`,
          slot: slotLabel(s),
          slotOrders: s.orders,
          averageSlotOrders: Math.round(avg * 10) / 10,
          slotVsAveragePct: pctOfAvg,
          weeksObserved: h.weeksObserved,
          sampleOrders: h.totalOrders,
          window: `${h.fromDate} to ${h.toDate}`,
          ...audienceFlags(audience),
        },
        economics: { ...coupon.economics, assumptions: [...coupon.economics.assumptions, "Some redemptions may be visits moved from busier hours, not new sales."] },
        changes: [],
      },
    ];
  });
}

/** PEAK_TIMING: the busiest slot (at least 150% of average). An in-store stock/staff tip; no customer message. */
export function peakCandidates(ctx: TipContext, fb: TipFeedback): Built[] {
  const h = ctx.heatmap;
  if (h.weeksObserved < OFF_PEAK_RULES.minWeeks) return [];
  const slots = slotsFrom(h.cells, OFF_PEAK_RULES.slotHours);
  const avg = averageOrders(slots);
  const busy = slots.filter((s) => s.orders >= (avg * OFF_PEAK_RULES.busyAbovePct) / 100 && !fb.excludeSlots.includes(slotKey(s))).sort((a, b) => b.orders - a.orders)[0];
  if (!busy) return [];
  const pct = Math.round((busy.orders / avg) * 100);
  const facts = [`${slotLabel(busy)} had ${busy.orders} orders in ${h.weeksObserved} weeks, ${pct}% of your average 2-hour slot (${Math.round(avg * 10) / 10}).`, `Based on ${h.totalOrders} paid orders.`];
  return [
    {
      key: `PEAK_TIMING:${slotKey(busy)}`,
      family: "PEAK_TIMING",
      type: "PEAK_TIMING",
      quality: Math.min(5, (pct - 100) / 20),
      title: `${slotLabel(busy)} is your busiest time: be ready for it`,
      why: `${facts[0]} Keep fast-moving items stocked and an extra hand at the counter in this window so no sale is lost to waiting.`,
      whyFacts: facts,
      messageKind: null,
      festivalName: null,
      offer: { kind: "NONE", action: `Stock fast movers and add counter help on ${slotLabel(busy)}.` },
      audience: [],
      audienceRule: "segment",
      categories: [],
      productIds: [],
      evidence: { rule: `2-hour slot with at least ${OFF_PEAK_RULES.busyAbovePct}% of the average slot's orders`, slot: slotLabel(busy), slotOrders: busy.orders, averageSlotOrders: Math.round(avg * 10) / 10, weeksObserved: h.weeksObserved, sampleOrders: h.totalOrders, window: `${h.fromDate} to ${h.toDate}` },
      economics: { note: "No sales estimate: this tip is about not losing sales at peak time." },
      changes: [],
    },
  ];
}
