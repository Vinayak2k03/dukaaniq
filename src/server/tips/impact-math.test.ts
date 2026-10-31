import assert from "node:assert/strict";
import test from "node:test";
import { compareWindows, impactWindows, verdictOf } from "./impact-math";

test("windows: after starts the day after approval, before ends the day before", () => {
  const w = impactWindows("2026-10-10", "2026-10-20")!;
  assert.deepEqual(w.after, { fromDate: "2026-10-11", toDate: "2026-10-20", days: 10 });
  assert.deepEqual(w.before, { fromDate: "2026-09-26", toDate: "2026-10-09", days: 14 });
});

test("windows: after is capped at 14 days, before at least 7", () => {
  assert.equal(impactWindows("2026-01-01", "2026-12-01")!.after.days, 14);
  assert.equal(impactWindows("2026-10-10", "2026-10-12")!.before.days, 7);
  assert.equal(impactWindows("2026-10-10", "2026-10-10"), null);
});

test("compare: per-day sales and percent change", () => {
  const c = compareWindows({ salesPaise: 700_000, orders: 70, profitPaise: null }, 7, { salesPaise: 360_000, orders: 36, profitPaise: null }, 3);
  assert.equal(c.beforePerDayPaise, 100_000);
  assert.equal(c.afterPerDayPaise, 120_000);
  assert.equal(c.changePct, 20);
  assert.equal(verdictOf(c, 3), "up");
  assert.equal(verdictOf(c, 2), "too-early");
});

test("verdict: small moves are flat, drops are down, empty baseline has no percent", () => {
  const t = (s: number) => ({ salesPaise: s, orders: 1, profitPaise: null });
  assert.equal(verdictOf(compareWindows(t(700), 7, t(715), 7), 7), "flat");
  assert.equal(verdictOf(compareWindows(t(700), 7, t(350), 7), 7), "down");
  const none = compareWindows(t(0), 7, t(500), 7);
  assert.equal(none.changePct, null);
  assert.equal(verdictOf(none, 7), "no-baseline");
});
