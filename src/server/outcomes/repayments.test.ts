import assert from "node:assert/strict";
import { test } from "node:test";
import { attributeRepayments, summarizeOutcomes, type LedgerRow, type ReminderMessage } from "./repayments";

const at = (ymd: string, hh = 12) => new Date(`${ymd}T${String(hh).padStart(2, "0")}:00:00+05:30`);
const msg = (id: string, customerId: string, sent: string, simulated = false): ReminderMessage => ({ id, customerId, sentAt: at(sent, 10), simulated });
const row = (id: string, customerId: string, type: LedgerRow["type"], amountPaise: number, ymd: string, reversesEntryId: string | null = null): LedgerRow => ({ id, customerId, type, amountPaise, entryDate: at(ymd), reversesEntryId });

test("a repayment after the reminder is attributed to it", () => {
  const [o] = attributeRepayments([msg("m1", "c1", "2026-10-10")], [row("e1", "c1", "REPAYMENT_RECEIVED", 35000, "2026-10-12")]);
  assert.equal(o.repaidPaise, 35000);
});

test("a repayment on the same day counts, an earlier one does not", () => {
  const [o] = attributeRepayments([msg("m1", "c1", "2026-10-10")], [row("e1", "c1", "REPAYMENT_RECEIVED", 100, "2026-10-10"), row("e2", "c1", "REPAYMENT_RECEIVED", 200, "2026-10-09")]);
  assert.equal(o.repaidPaise, 100);
});

test("a repayment outside the window or for another customer does not count", () => {
  const [o] = attributeRepayments([msg("m1", "c1", "2026-10-01")], [row("e1", "c1", "REPAYMENT_RECEIVED", 100, "2026-10-20"), row("e2", "c2", "REPAYMENT_RECEIVED", 100, "2026-10-02")]);
  assert.equal(o.repaidPaise, 0);
});

test("a payment goes to the latest reminder only, never two", () => {
  const out = attributeRepayments([msg("m1", "c1", "2026-10-01"), msg("m2", "c1", "2026-10-08")], [row("e1", "c1", "REPAYMENT_RECEIVED", 500, "2026-10-09")]);
  assert.deepEqual(out.map((o) => o.repaidPaise), [0, 500]);
});

test("corrected repayments are netted out", () => {
  const entries = [row("e1", "c1", "REPAYMENT_RECEIVED", 500, "2026-10-11"), row("a1", "c1", "ADJUSTMENT_INCREASE", 200, "2026-10-12", "e1"), row("e2", "c1", "REPAYMENT_RECEIVED", 100, "2026-10-11"), row("a2", "c1", "ADJUSTMENT_INCREASE", 100, "2026-10-12", "e2")];
  const [o] = attributeRepayments([msg("m1", "c1", "2026-10-10")], entries);
  assert.equal(o.repaidPaise, 300);
  assert.equal(o.repayments.length, 1);
});

test("summary counts customers once", () => {
  const out = attributeRepayments([msg("m1", "c1", "2026-10-01"), msg("m2", "c2", "2026-10-01")], [row("e1", "c1", "REPAYMENT_RECEIVED", 100, "2026-10-02"), row("e2", "c1", "REPAYMENT_RECEIVED", 50, "2026-10-03")]);
  assert.deepEqual(summarizeOutcomes(out), { reminded: 2, repaidCustomers: 1, repaidPaise: 150 });
});
