import assert from "node:assert/strict";
import { test } from "node:test";
import { billTotals } from "./math";

test("totals multiply quantity by price, in paise", () => {
  const b = billTotals([{ quantity: 2, unitPaise: 1400, costPaise: 1100 }, { quantity: 1, unitPaise: 2500, costPaise: 1800 }]);
  assert.deepEqual([b.grossPaise, b.netPaise, b.costPaise], [5300, 5300, 4000]);
});

test("fractional quantities round to the paisa", () => {
  const b = billTotals([{ quantity: 0.25, unitPaise: 4850, costPaise: 3900 }]);
  assert.deepEqual([b.lines[0].lineTotalPaise, b.lines[0].lineCostPaise], [1213, 975]);
});

test("a discount can never exceed the bill", () => {
  assert.equal(billTotals([{ quantity: 1, unitPaise: 1000, costPaise: 0 }], 300).netPaise, 700);
  assert.equal(billTotals([{ quantity: 1, unitPaise: 1000, costPaise: 0 }], 5000).netPaise, 0);
});
