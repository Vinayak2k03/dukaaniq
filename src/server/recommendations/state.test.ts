import assert from "node:assert/strict";
import { test } from "node:test";
import { canTransition, isOpen } from "./state";

test("a recommendation must be approved before it can be queued", () => {
  assert.equal(canTransition("PENDING_APPROVAL", "EXECUTION_PENDING"), false);
  assert.equal(canTransition("DRAFT", "EXECUTION_PENDING"), false);
  assert.equal(canTransition("PENDING_APPROVAL", "APPROVED"), true);
  assert.equal(canTransition("APPROVED", "EXECUTION_PENDING"), true);
});

test("a rejection is final and never leads to execution", () => {
  assert.equal(canTransition("REJECTED", "APPROVED"), false);
  assert.equal(canTransition("REJECTED", "EXECUTION_PENDING"), false);
  assert.equal(canTransition("REJECTED", "PENDING_APPROVAL"), false);
});

test("simulated, cancelled and failed are terminal", () => {
  for (const s of ["SIMULATED", "CANCELLED", "FAILED"] as const) assert.equal(canTransition(s, "APPROVED"), false);
});

test("execution results come only from the queued state", () => {
  assert.equal(canTransition("EXECUTION_PENDING", "SIMULATED"), true);
  assert.equal(canTransition("APPROVED", "SIMULATED"), false);
});

test("open statuses are the ones still awaiting action", () => {
  assert.equal(isOpen("PENDING_APPROVAL"), true);
  assert.equal(isOpen("REJECTED"), false);
  assert.equal(isOpen("SIMULATED"), false);
});
