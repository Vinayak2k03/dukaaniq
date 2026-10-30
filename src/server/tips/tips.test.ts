import assert from "node:assert/strict";
import { test } from "node:test";
import { averageOrders, slotsFrom, withConfidence } from "@/server/analytics/insights-math";
import { rejectReason, templateMessage } from "@/server/recommendations/text";
import { comboPrice, couponCode, maxDiscountPct, pickDiscountPct, scenarioEconomics } from "./economics";
import { factsFor } from "./facts";
import { applyNote, applySignal, keywordNote } from "./feedback";
import { pastUplift } from "./generators/festive";
import { fixtureContext } from "./fixture";
import { generateCandidates, selectBatch } from "./rank";
import { emptyFeedback, type Candidate } from "./types";

const ctx = fixtureContext();
const ranked = generateCandidates(ctx, emptyFeedback());
const byKey = (k: string, list: Candidate[] = ranked) => list.find((c) => c.key === k);

test("first batch is 3 diverse tips led by the merchant's priorities, including the upcoming festival", () => {
  const { batch, remaining } = selectBatch(ranked, { count: 3, shown: [], open: [] });
  assert.deepEqual(batch.map((c) => c.family), ["LOYALTY", "FESTIVE", "OFF_PEAK"]);
  assert.equal(batch[1].festivalName, "Dhanteras & Diwali");
  assert.ok(remaining > 0);
});

test("'more tips' never repeats a shown or already-open tip", () => {
  const first = selectBatch(ranked, { count: 3, shown: [], open: [] }).batch.map((c) => c.key);
  const second = selectBatch(ranked, { count: 3, shown: first, open: ["CREDIT_REMINDER:c02"] }).batch;
  assert.equal(second.length, 3);
  assert.ok(second.every((c) => !first.includes(c.key) && c.key !== "CREDIT_REMINDER:c02"));
  assert.equal(new Set(second.map((c) => c.family)).size, 3);
});

test("the same product combo is never repeated under another family", () => {
  const first = selectBatch(ranked, { count: 8, shown: [], open: [] }).batch;
  const sets = first.filter((c) => c.productIds.length).map((c) => [...c.productIds].sort().join("+"));
  assert.equal(new Set(sets).size, sets.length);
});

test("a focus returns only those families and may repeat a family", () => {
  const { batch } = selectBatch(ranked, { count: 3, focus: ["LOYALTY"], shown: [], open: [] });
  assert.deepEqual(batch.map((c) => c.key), ["LOYALTY:coupon", "LOYALTY:combo", "LOYALTY:credit"]);
});

test("every discount and combo respects the margin floor", () => {
  const floor = (price: number, cost: number) => price >= cost * 1.05;
  for (const c of ranked) {
    if (c.offer.kind === "COUPON") {
      const o = c.offer;
      const eligible = ctx.products.filter((p) => (o.eligibleCategories === "ALL" || o.eligibleCategories.includes(p.category ?? "")) && !o.excludedProducts.includes(p.name));
      assert.ok(eligible.length > 0, c.key);
      for (const p of eligible) assert.ok(floor(p.pricePaise * (1 - o.discountPct / 100), p.costPaise), `${c.key} ${p.name}`);
    }
    if (c.offer.kind === "COMBO") assert.ok(floor(c.offer.comboPricePaise, c.offer.items.reduce((t, i) => t + i.costPaise, 0)), c.key);
  }
});

test("opted-out customers are never in an audience; festive audiences are opted in", () => {
  for (const c of ranked) assert.ok(!c.audience.some((a) => a.customerId === "c01" || a.customerId === "c33"), c.key);
  for (const c of ranked.filter((x) => x.family === "FESTIVE")) assert.ok(c.audience.every((a) => a.optedIn));
});

test("loyalty audience is the top 20% by spend among recent buyers", () => {
  const coupon = byKey("LOYALTY:coupon")!;
  assert.equal(coupon.audienceRule, "spend");
  assert.ok(coupon.audience.every((a) => ["ACTIVE", "COOLING_OFF"].includes(ctx.customers.find((c) => c.id === a.customerId)!.segment)));
  assert.equal(coupon.audience[0].customerId, "c00");
});

test("udhaar facility only goes to loyal customers with a clean repayment record, and never writes credit", () => {
  const credit = byKey("LOYALTY:credit")!;
  assert.deepEqual(credit.audience.map((a) => a.customerId), ["c00"]);
  assert.equal(credit.offer.kind, "CREDIT_LIMIT");
  assert.equal((credit.economics as { label: string }).label, "Risk exposure, not revenue");
});

test("off-peak slot is quiet but open, with its time window on the coupon", () => {
  const off = ranked.find((c) => c.family === "OFF_PEAK")!;
  assert.equal(off.key, "OFF_PEAK:2:14");
  assert.ok(off.offer.kind === "COUPON" && off.offer.timeWindow?.dow === 2 && off.offer.discountPct <= 7);
  assert.equal(generateCandidates(fixtureContext({ heatmap: { ...ctx.heatmap, weeksObserved: 3 } }), emptyFeedback()).filter((c) => c.family === "OFF_PEAK").length, 0);
});

test("no festival within 3-21 days means no festive tip", () => {
  assert.equal(generateCandidates(fixtureContext({ ref: "2026-12-01" }), emptyFeedback()).filter((c) => c.family === "FESTIVE").length, 0);
});

test("COST_TOO_HIGH lowers the discount and refreshes the economics", () => {
  const before = byKey("LOYALTY:coupon")!;
  const fb = applySignal(emptyFeedback(), "COST_TOO_HIGH", before);
  const after = byKey("LOYALTY:coupon", generateCandidates(ctx, fb))!;
  assert.ok(before.offer.kind === "COUPON" && after.offer.kind === "COUPON");
  assert.ok(after.offer.discountPct < before.offer.discountPct);
  assert.ok((after.economics as { maxDiscountExposurePaise: number }).maxDiscountExposurePaise < (before.economics as { maxDiscountExposurePaise: number }).maxDiscountExposurePaise);
  assert.match(after.changes[0], /Discount lowered/);
});

test("WRONG_AUDIENCE switches spend to frequency; DO_NOT_CONTACT excludes those customers", () => {
  const coupon = byKey("LOYALTY:coupon")!;
  assert.equal(applySignal(emptyFeedback(), "WRONG_AUDIENCE", coupon).audienceRule, "frequency");
  const fb = applySignal(emptyFeedback(), "DO_NOT_CONTACT", coupon);
  const ids = new Set(coupon.audience.map((a) => a.customerId));
  for (const c of generateCandidates(ctx, fb)) assert.ok(!c.audience.some((a) => ids.has(a.customerId)), c.key);
});

test("BAD_TIMING on a festival that is too close moves to the next festival; OPERATIONAL_CONSTRAINT drops products", () => {
  const fest = ranked.find((c) => c.family === "FESTIVE")!;
  const next = generateCandidates(ctx, applySignal(emptyFeedback(), "BAD_TIMING", fest)).find((c) => c.family === "FESTIVE")!;
  assert.equal(next.festivalName, "Chhath Puja");
  const combo = byKey("LOYALTY:combo")!;
  const after = generateCandidates(ctx, applySignal(emptyFeedback(), "OPERATIONAL_CONSTRAINT", combo));
  assert.ok(after.every((c) => !c.productIds.some((p) => combo.productIds.includes(p))));
});

test("free-text notes: keywords first, then validated structured feedback", () => {
  assert.deepEqual(keywordNote("discount zyada hai")?.reasons, ["COST_TOO_HIGH"]);
  assert.deepEqual(keywordNote("festival wale tips nahi chahiye")?.note.excludeFamilies, ["FESTIVE"]);
  assert.equal(keywordNote("hmm theek hai"), null);
  const fb = applyNote(emptyFeedback(), { excludeFamilies: [], preferFamilies: ["OFF_PEAK"], maxDiscountPct: 5, excludeCustomerNames: ["customer 0", "Nobody"], excludeCategories: ["dairy", "Toys"] }, { categories: ["Dairy", "Staples"], customers: [{ id: "c00", name: "Customer 0" }] });
  assert.deepEqual([fb.maxDiscountPct, fb.excludeCategories, fb.excludeCustomerIds, fb.preferFamilies], [5, ["Dairy"], ["c00"], ["OFF_PEAK"]]);
});

test("every candidate's template message passes the AI safety check", () => {
  for (const c of ranked) {
    for (const tone of ["standard", "softer"] as const)
      for (const language of ["ENGLISH", "HINGLISH", "HINDI"] as const) {
        const f = factsFor({ ...c, audience: c.audience.map((a) => ({ ...a, language })) }, ctx.merchant.shopName, tone);
        if (!c.messageKind) assert.equal(f, null);
        else assert.equal(rejectReason(templateMessage(f!), f!), null, `${c.key} ${language} ${tone}`);
      }
  }
});

test("rejectReason for offers: code, discount, validity and time window must survive; nothing may be added", () => {
  const off = ranked.find((c) => c.family === "OFF_PEAK")!;
  const f = factsFor(off, "Sharma Kirana Store")!;
  assert.ok(f.kind === "OFF_PEAK" && f.offer === "coupon");
  const ok = templateMessage(f);
  assert.equal(rejectReason(ok, f), null);
  assert.equal(rejectReason(ok.replace(f.couponCode, "HAPPY99-ZZZZ"), f), "code_missing");
  assert.equal(rejectReason(ok.replace(f.validTill, "soon"), f), "validity_missing");
  assert.equal(rejectReason(ok.replace(f.timeWindowText, "in the afternoon"), f), "time_window_missing");
  assert.equal(rejectReason(`${ok} Extra 20% off today!`, f), "unexpected_number");
  const combo = factsFor(byKey("LOYALTY:combo")!, "Sharma Kirana Store")!;
  assert.ok(combo.kind === "LOYALTY_COMBO");
  assert.equal(rejectReason(templateMessage(combo).replace(combo.comboPriceText, "₹1"), combo), "amount_missing");
  const credit = factsFor(byKey("LOYALTY:credit")!, "Sharma Kirana Store")!;
  assert.equal(rejectReason("Hello {name}, you can now take udhaar up to ₹9,999 at our shop.", credit), "amount_missing");
});

test("economics: scenario range, capped discount and margin helpers", () => {
  const e = scenarioEconomics({ audienceSize: 100, basketPaise: 40_000, costRate: 0.85, discountPerRedemptionPaise: 4_000 });
  assert.deepEqual(e.scenarios.map((s) => s.redemptions), [5, 10, 20]);
  assert.deepEqual(e.scenarios[1], { redemptionPct: 10, redemptions: 10, incrementalSalesPaise: 400_000, productCostPaise: 340_000, discountExposurePaise: 40_000, grossProfitImpactPaise: 20_000 });
  assert.equal(e.maxDiscountExposurePaise, 400_000);
  assert.equal(maxDiscountPct(10_000, 8_500, 5), 10);
  assert.equal(pickDiscountPct(10, 7), 7);
  assert.equal(pickDiscountPct(2, null), null);
  const items = [{ productId: "a", name: "A", pricePaise: 24_500, costPaise: 20_500 }, { productId: "b", name: "B", pricePaise: 4_800, costPaise: 3_900 }];
  const price = comboPrice(items, 8, 5)!;
  assert.ok(price.comboPricePaise >= (20_500 + 3_900) * 1.05 && price.comboPricePaise < price.listPricePaise);
  for (const seed of ["s1", "dry-run", "test-session", "a", "b", "c", "d"]) assert.match(couponCode("LOYAL", 10, seed), /^LOYAL10-[A-Z2-9]{4}$/);
  assert.notEqual(couponCode("LOYAL", 10, "s1"), couponCode("LOYAL", 10, "s2"));
});

test("insight maths: pair confidence, 2-hour slots and festival uplift", () => {
  const pairs = withConfidence([{ a: "x", b: "y", support: 5 }], new Map([["x", 20], ["y", 10]]));
  assert.deepEqual([pairs[0].confidenceAB, pairs[0].confidenceBA], [0.25, 0.5]);
  const slots = slotsFrom([{ dow: 1, hour: 9, orders: 2, netSalesPaise: 1 }, { dow: 1, hour: 10, orders: 4, netSalesPaise: 1 }, { dow: 1, hour: 11, orders: 0, netSalesPaise: 0 }]);
  assert.deepEqual(slots.map((s) => [s.startHour, s.orders]), [[9, 6]]);
  assert.equal(averageOrders(slots), 6);
  const u = pastUplift(ctx.daily, ctx.festivals, ctx.ref).find((x) => x.festival === "Navratri & Dussehra")!;
  assert.equal(u.upliftPct, 40);
});
