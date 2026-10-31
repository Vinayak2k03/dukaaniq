import assert from "node:assert/strict";
import test from "node:test";
import type { Draft } from "@/server/recommendations/draft";
import { parseStaged, rejectedKeysOf, stage } from "./staged";

const draft: Draft = {
  type: "LOYALTY_OFFER" as Draft["type"],
  title: "t", explanation: "e", evidence: {}, offerTerms: {}, economics: {}, message: "m", language: "ENGLISH", channel: "IN_APP",
  audience: [{ customerId: "c1", lastPurchaseAt: new Date("2026-10-01T00:00:00Z"), daysSinceLastPurchase: 29 }],
};

test("a staged draft survives the JSON column with its dates", () => {
  const raw = JSON.parse(JSON.stringify({ k: stage(draft) }));
  const back = parseStaged(raw).k;
  assert.equal(back.status, "SHOWN");
  assert.ok(back.draft.audience[0].lastPurchaseAt instanceof Date);
  assert.equal(back.draft.audience[0].lastPurchaseAt?.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("malformed entries are ignored and only recent rejections count", () => {
  assert.deepEqual(parseStaged(null), {});
  assert.deepEqual(parseStaged([]), {});
  assert.deepEqual(parseStaged({ bad: { status: "SHOWN" } }), {});
  const staged = {
    old: { ...stage(draft), status: "REJECTED" as const, decidedAt: "2026-01-01T00:00:00Z" },
    fresh: { ...stage(draft), status: "REJECTED" as const, decidedAt: "2026-10-30T00:00:00Z" },
    shown: stage(draft),
  };
  assert.deepEqual(rejectedKeysOf(staged, new Date("2026-10-01T00:00:00Z")), ["fresh"]);
});
