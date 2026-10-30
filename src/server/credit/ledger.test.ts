import assert from "node:assert/strict";
import { test } from "node:test";
import { computeAccount, correctableRemainingPaise, type LedgerEntry } from "./ledger";

// Local (IST) 12:00 on a given day, expressed as a UTC instant.
const at = (ymd: string) => new Date(Date.parse(`${ymd}T12:00:00+05:30`));
const e = (id: string, type: LedgerEntry["type"], rupees: number, entry: string, due: string | null = null): LedgerEntry => ({
  id,
  type,
  amountPaise: Math.round(rupees * 100),
  entryDate: at(entry),
  dueDate: due ? at(due) : null,
});
const REF = "2026-10-30";

test("no entries is NO_CREDIT with zero balance", () => {
  const a = computeAccount([], REF);
  assert.equal(a.status, "NO_CREDIT");
  assert.equal(a.balancePaise, 0);
});

test("balance = credit given - repayments", () => {
  const a = computeAccount([e("a", "CREDIT_GIVEN", 500, "2026-10-01", "2026-11-10"), e("b", "REPAYMENT_RECEIVED", 200, "2026-10-05")], REF);
  assert.equal(a.balancePaise, 30000);
  assert.equal(a.status, "UPCOMING");
  assert.equal(a.nextDueDate, "2026-11-10");
});

test("fully repaid is SETTLED", () => {
  const a = computeAccount([e("a", "CREDIT_GIVEN", 100, "2026-10-01", "2026-10-20"), e("b", "REPAYMENT_RECEIVED", 100, "2026-10-02")], REF);
  assert.equal(a.status, "SETTLED");
  assert.equal(a.overduePaise, 0);
});

test("repayments clear the oldest credit first, so later credit can stay unpaid", () => {
  const a = computeAccount(
    [e("old", "CREDIT_GIVEN", 100, "2026-09-01", "2026-09-20"), e("new", "CREDIT_GIVEN", 200, "2026-10-01", "2026-11-20"), e("r", "REPAYMENT_RECEIVED", 100, "2026-10-10")],
    REF,
  );
  assert.equal(a.overduePaise, 0);
  assert.equal(a.status, "UPCOMING");
  assert.equal(a.oldestUnpaid?.entryId, "new");
});

test("partly repaid old credit leaves the remainder overdue", () => {
  const a = computeAccount([e("old", "CREDIT_GIVEN", 100, "2026-09-01", "2026-09-20"), e("r", "REPAYMENT_RECEIVED", 30, "2026-10-10")], REF);
  assert.equal(a.status, "OVERDUE");
  assert.equal(a.overduePaise, 7000);
  assert.equal(a.daysOverdue, 40);
});

test("due on the reference date is DUE_TODAY, not overdue", () => {
  const a = computeAccount([e("a", "CREDIT_GIVEN", 50, "2026-10-01", REF)], REF);
  assert.equal(a.status, "DUE_TODAY");
  assert.equal(a.overduePaise, 0);
});

test("credit with no due date is never overdue", () => {
  const a = computeAccount([e("a", "CREDIT_GIVEN", 50, "2026-01-01")], REF);
  assert.equal(a.status, "UPCOMING");
  assert.equal(a.nextDueDate, null);
});

test("adjustments change the balance like credit and repayments", () => {
  const a = computeAccount(
    [e("a", "CREDIT_GIVEN", 500, "2026-10-01", "2026-11-10"), e("d", "ADJUSTMENT_DECREASE", 100, "2026-10-02"), e("i", "ADJUSTMENT_INCREASE", 30, "2026-10-03")],
    REF,
  );
  assert.equal(a.balancePaise, 43000);
  assert.equal(a.adjustmentNetPaise, -7000);
});

test("paise arithmetic stays exact for awkward amounts", () => {
  const a = computeAccount([e("a", "CREDIT_GIVEN", 0.1, "2026-10-01"), e("b", "CREDIT_GIVEN", 0.2, "2026-10-02")], REF);
  assert.equal(a.balancePaise, 30);
});

test("correctable remaining subtracts earlier corrections", () => {
  const target = e("a", "CREDIT_GIVEN", 500, "2026-10-01");
  assert.equal(correctableRemainingPaise(target, [{ amountPaise: 12000 }]), 38000);
  assert.equal(correctableRemainingPaise(target, [{ amountPaise: 60000 }]), 0);
});
