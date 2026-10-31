import assert from "node:assert/strict";
import test from "node:test";
import { fixtureContext } from "./fixture";
import { generateCandidates, historyBoost, historyNote } from "./rank";
import { emptyFeedback, type TipHistory } from "./types";

const history = (over: TipHistory["families"], recentKeys: string[] = []): TipHistory => ({ asOf: "2026-10-30", families: over, recentKeys });

test("approved families score higher, others are untouched", () => {
  const fb = emptyFeedback();
  const base = generateCandidates(fixtureContext(), fb);
  const boosted = generateCandidates(fixtureContext({ history: history({ BUNDLE: { approved: 2, rejected: 0, avgSalesChangePct: null } }) }), fb);
  const score = (list: typeof base, family: string) => list.find((c) => c.family === family)?.score;
  assert.ok(base.some((c) => c.family === "BUNDLE"), "fixture should produce a bundle tip");
  assert.equal(Math.round(((score(boosted, "BUNDLE") ?? 0) - (score(base, "BUNDLE") ?? 0)) * 100) / 100, 12);
  assert.equal(score(boosted, "LOYALTY"), score(base, "LOYALTY"));
});

test("measured sales moves the boost: up adds, down subtracts, capped at 20 for approvals", () => {
  const f = (approved: number, pct: number | null) => history({ LOYALTY: { approved, rejected: 0, avgSalesChangePct: pct } });
  assert.equal(historyBoost("LOYALTY", f(1, null)), 6);
  assert.equal(historyBoost("LOYALTY", f(1, 12)), 16);
  assert.equal(historyBoost("LOYALTY", f(1, -9)), -4);
  assert.equal(historyBoost("LOYALTY", f(1, 2)), 6);
  assert.equal(historyBoost("LOYALTY", f(9, null)), 20);
  assert.equal(historyBoost("LOYALTY", undefined), 0);
  assert.equal(historyBoost("LOYALTY", history({ LOYALTY: { approved: 0, rejected: 3, avgSalesChangePct: null } })), 0);
});

test("a boosted tip says why, with the measured change", () => {
  const h = history({ LOYALTY: { approved: 2, rejected: 0, avgSalesChangePct: 12.5 } });
  assert.equal(historyNote("LOYALTY", h), "You approved 2 loyalty tips before; sales per day were up 12.5% in the days after.");
  assert.equal(historyNote("FESTIVE", h), null);
  const loyalty = generateCandidates(fixtureContext({ history: h }), emptyFeedback()).find((c) => c.family === "LOYALTY");
  assert.ok(loyalty?.whyFacts.some((w) => w.startsWith("You approved 2 loyalty tips")));
});

test("rejected and recently approved tips are skipped by the batch selector", async () => {
  const { selectBatch } = await import("./rank");
  const ranked = generateCandidates(fixtureContext(), emptyFeedback());
  const [first, second] = ranked;
  const h = history({}, [first.key]);
  h.rejectedKeys = [second.key];
  const { batch } = selectBatch(ranked, { count: 20, shown: [], open: [...(h.recentKeys), ...(h.rejectedKeys ?? [])] });
  assert.ok(!batch.some((c) => c.key === first.key || c.key === second.key));
});
