/** Bill arithmetic in integer paise. lineTotal = quantity x unit price; lineCost = quantity x unit cost (schema notes on SaleItem). */

export type BillLine = { quantity: number; unitPaise: number; costPaise: number };

export function billTotals(lines: BillLine[], discountPaise = 0) {
  const priced = lines.map((l) => ({ ...l, lineTotalPaise: Math.round(l.quantity * l.unitPaise), lineCostPaise: Math.round(l.quantity * l.costPaise) }));
  const grossPaise = priced.reduce((t, l) => t + l.lineTotalPaise, 0);
  const discount = Math.min(Math.max(0, discountPaise), grossPaise);
  return { lines: priced, grossPaise, discountPaise: discount, netPaise: grossPaise - discount, costPaise: priced.reduce((t, l) => t + l.lineCostPaise, 0) };
}
