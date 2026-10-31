import assert from "node:assert/strict";
import { test } from "node:test";
import { activeDaysOf, pickReapplyable, reapplyMessage, type PastApproval } from "./reapply-math";

const base = (o: Partial<PastApproval>): PastApproval => ({ recommendationId: "r1", key: "LOYALTY:a", title: "Loyalty offer", approvedYmd: "2026-10-01", validityDays: 14, impact: null, ...o });
const up = { changePct: 12.5, verdict: "up" as const, beforePerDayPaise: 800_000, afterPerDayPaise: 900_000, basis: "shop" as const };

test("active period follows the offer's validity, between 7 and 14 days", () => {
  assert.equal(activeDaysOf(null), 14);
  assert.equal(activeDaysOf(3), 7);
  assert.equal(activeDaysOf(30), 14);
});

test("a tip comes back only after its active period is over", () => {
  const today = "2026-10-31";
  assert.equal(pickReapplyable([base({ approvedYmd: "2026-10-10" })], { todayYmd: today, blockedKeys: [] }).length, 1);
  assert.equal(pickReapplyable([base({ approvedYmd: "2026-10-20" })], { todayYmd: today, blockedKeys: [] }).length, 0);
  assert.equal(pickReapplyable([base({ validityDays: 7, approvedYmd: "2026-10-20" })], { todayYmd: today, blockedKeys: [] }).length, 1);
});

test("open, re-approved or rejected tips are not offered; one card per tip", () => {
  const old = base({ approvedYmd: "2026-09-01", recommendationId: "old" });
  const newer = base({ approvedYmd: "2026-10-05", recommendationId: "new" });
  const again = base({ approvedYmd: "2026-10-28", recommendationId: "again" });
  assert.deepEqual(pickReapplyable([old, newer], { todayYmd: "2026-10-31", blockedKeys: [] }).map((a) => a.recommendationId), ["new"]);
  assert.equal(pickReapplyable([old, newer, again], { todayYmd: "2026-10-31", blockedKeys: [] }).length, 0);
  assert.equal(pickReapplyable([newer], { todayYmd: "2026-10-31", blockedKeys: ["LOYALTY:a"] }).length, 0);
});

test("message says what happened and asks", () => {
  const m = reapplyMessage(base({ impact: up }));
  assert.match(m, /approved "Loyalty offer"/);
  assert.match(m, /grew 12\.5%/);
  assert.match(m, /Do you want to reapply it\?$/);
  assert.match(reapplyMessage(base({ impact: { ...up, changePct: -8, verdict: "down" } })), /dipped 8%.*only if you think it helped/);
  assert.match(reapplyMessage(base({ impact: { ...up, changePct: 1, verdict: "flat" } })), /about the same/);
  assert.match(reapplyMessage(base({ impact: null })), /not enough sales data/);
});
