import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeOutcomes } from "./outcome-math";

const economics = { scenarios: [
  { redemptionPct: 10, redemptions: 1, incrementalSalesPaise: 50_000 },
  { redemptionPct: 30, redemptions: 3, incrementalSalesPaise: 150_000 },
] };

test("no outcomes yields no-data", () => {
  const s = summarizeOutcomes([], 10, economics);
  assert.equal(s.verdict, "no-data");
  assert.equal(s.customersConverted, 0);
});

test("counts distinct customers and sums sales against the estimate", () => {
  const s = summarizeOutcomes([
    { type: "OFFER_REDEEMED", customerId: "a", amountPaise: 40_000 },
    { type: "CUSTOMER_RETURNED", customerId: "a", amountPaise: 0 },
    { type: "CUSTOMER_RETURNED", customerId: "b", amountPaise: 25_000 },
  ], 10, economics);
  assert.equal(s.customersConverted, 2);
  assert.equal(s.redemptions, 1);
  assert.equal(s.returns, 2);
  assert.equal(s.measuredSalesPaise, 65_000);
  assert.equal(s.conversionPct, 20);
  assert.equal(s.verdict, "within");
});

test("above range and missing estimate", () => {
  const rows = ["a", "b", "c", "d"].map((c) => ({ type: "OFFER_REDEEMED", customerId: c, amountPaise: 0 }));
  assert.equal(summarizeOutcomes(rows, 10, economics).verdict, "above");
  assert.equal(summarizeOutcomes(rows, 10, {}).verdict, "no-estimate");
});
