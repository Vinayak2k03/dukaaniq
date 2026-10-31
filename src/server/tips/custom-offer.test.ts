import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCustomOffer } from "./custom-offer";
import { factsFor } from "./facts";
import { fixtureContext } from "./fixture";
import { templateMessage } from "@/server/recommendations/text";

const ctx = fixtureContext();
const build = (discountPct: number, audience: Parameters<typeof buildCustomOffer>[1]["audience"]) => buildCustomOffer(ctx, { discountPct, audience });

test("the exact percentage the owner asked for is used, not the usual 15% ladder", () => {
  const r = build(6, "LOYAL");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.candidate.offer.kind === "COUPON" && r.candidate.offer.discountPct, 6);
  assert.equal(r.candidate.title.startsWith("6% off for"), true);
  assert.equal(r.candidate.type, "LOYALTY");
  assert.equal(r.candidate.messageKind, "OFFER");
  assert.ok(r.candidate.audience.length > 0);
  assert.equal(r.candidate.evidence.requestedDiscountPct, 6);
});

test("the margin floor still decides: products that cannot carry the discount are left out", () => {
  const r = build(15, "ALL");
  assert.ok(r.ok);
  if (!r.ok) return;
  const o = r.candidate.offer;
  assert.ok(o.kind === "COUPON" && o.excludedProducts.length > 0);
  assert.ok(r.candidate.whyFacts.some((f) => f.includes("left out")));
  assert.equal(o.kind === "COUPON" && o.codeMode, "SHARED");
});

test("a discount no product can carry is refused with the most the margins allow", () => {
  const r = build(50, "LOYAL");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /too much|no room/);
  const bad = buildCustomOffer(ctx, { discountPct: 60, audience: "LOYAL" });
  assert.equal(bad.ok, false);
  const zero = buildCustomOffer(ctx, { discountPct: 0, audience: "LOYAL" });
  assert.equal(zero.ok, false);
});

test("each group is picked by its own rule; inactive customers become a win-back offer", () => {
  const inactive = build(5, "INACTIVE");
  assert.ok(inactive.ok);
  if (inactive.ok) {
    assert.ok(inactive.candidate.audience.every((a) => (a.daysSince ?? 0) > 30));
    assert.equal(inactive.candidate.type, "WINBACK");
    assert.equal(inactive.candidate.messageKind, "WINBACK");
  }
  const active = build(5, "ACTIVE");
  assert.ok(active.ok && active.candidate.audience.every((a) => (a.daysSince ?? 99) <= 14));
});

test("opted-out customers are never in the audience, and an empty group makes no offer", () => {
  const optedOut = fixtureContext({ customers: fixtureContext().customers.map((c) => ({ ...c, optedOut: true })) });
  const r = buildCustomOffer(optedOut, { discountPct: 5, audience: "ALL" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /No .* to send this to/);
});

test("the customer message names the discount, the minimum bill and the code placeholder", () => {
  const r = build(5, "ACTIVE");
  assert.ok(r.ok);
  if (!r.ok) return;
  const facts = factsFor(r.candidate, "Test Store");
  assert.ok(facts && facts.kind === "OFFER");
  const msg = templateMessage(facts!);
  assert.match(msg, /5%/);
  assert.match(msg, /\{code\}/);
  assert.match(msg, /\{name\}/);
});
