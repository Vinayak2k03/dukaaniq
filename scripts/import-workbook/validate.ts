import type { z } from "zod";
import type { RawRow } from "./read";
import {
  SUPPORTED_TIMEZONE,
  creditRow,
  customerRow,
  merchantRow,
  policyRow,
  productRow,
  saleItemRow,
  saleRow,
  summaryRow,
  toPaise,
  type CreditRow,
  type CustomerRow,
  type MerchantRow,
  type PolicyRow,
  type ProductRow,
  type SaleItemRow,
  type SaleRow,
} from "./schemas";

export type ValidationIssue = { sheet: string; row: number | null; message: string };

export type Dataset = {
  merchant: MerchantRow;
  policy: PolicyRow | null;
  customers: CustomerRow[];
  products: ProductRow[];
  sales: SaleRow[];
  saleItems: SaleItemRow[];
  credit: CreditRow[];
  summary: Map<string, number>;
};

type Rowed<T> = { rowNumber: number; data: T };

function parseSheet<S extends z.ZodObject>(
  sheets: Map<string, RawRow[]>,
  sheet: string,
  schema: S,
  issues: ValidationIssue[],
): Rowed<z.infer<S>>[] {
  const rows = sheets.get(sheet);
  if (!rows) {
    issues.push({ sheet, row: null, message: "sheet is missing" });
    return [];
  }
  const required = Object.keys(schema.shape);
  const present = new Set(Object.keys(rows[0]?.values ?? {}));
  const missing = required.filter((c) => !present.has(c));
  if (rows.length && missing.length) {
    issues.push({ sheet, row: 1, message: `missing required columns: ${missing.join(", ")}` });
    return [];
  }
  const out: Rowed<z.infer<S>>[] = [];
  for (const { rowNumber, values } of rows) {
    const parsed = schema.safeParse(values);
    if (parsed.success) out.push({ rowNumber, data: parsed.data });
    else
      for (const i of parsed.error.issues)
        issues.push({ sheet, row: rowNumber, message: `${i.path.join(".")}: ${i.message}` });
  }
  return out;
}

function assertUnique<T>(sheet: string, rows: Rowed<T>[], key: (r: T) => string, issues: ValidationIssue[]) {
  const seen = new Set<string>();
  for (const { rowNumber, data } of rows) {
    const k = key(data);
    if (seen.has(k)) issues.push({ sheet, row: rowNumber, message: `duplicate id ${k}` });
    seen.add(k);
  }
}

export function validateWorkbook(sheets: Map<string, RawRow[]>): { dataset: Dataset | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const bad = (sheet: string, row: number, message: string) => issues.push({ sheet, row, message });

  const merchants = parseSheet(sheets, "Merchants", merchantRow, issues);
  const customers = parseSheet(sheets, "Customers", customerRow, issues);
  const products = parseSheet(sheets, "Products", productRow, issues);
  const sales = parseSheet(sheets, "Sales", saleRow, issues);
  const items = parseSheet(sheets, "Sale_Items", saleItemRow, issues);
  const credit = parseSheet(sheets, "Credit_Entries", creditRow, issues);
  const policies = parseSheet(sheets, "Credit_Policies", policyRow, issues);
  const summaryRows = parseSheet(sheets, "Business_Summary", summaryRow, issues);

  if (merchants.length !== 1) issues.push({ sheet: "Merchants", row: null, message: `expected exactly 1 merchant, found ${merchants.length}` });
  const merchant = merchants[0]?.data;
  if (merchant && merchant.timezone !== SUPPORTED_TIMEZONE)
    bad("Merchants", merchants[0].rowNumber, `timezone ${merchant.timezone} is not supported by this importer (only ${SUPPORTED_TIMEZONE})`);

  assertUnique("Customers", customers, (r) => r.customer_id, issues);
  assertUnique("Products", products, (r) => r.product_id, issues);
  assertUnique("Sales", sales, (r) => r.sale_id, issues);
  assertUnique("Sales", sales.filter((s) => s.data.invoice_number), (r) => r.invoice_number ?? "", issues);
  assertUnique("Sale_Items", items, (r) => r.sale_item_id, issues);
  assertUnique("Credit_Entries", credit, (r) => r.ledger_entry_id, issues);

  if (merchant) {
    const sameMerchant = <T extends { merchant_id: string }>(sheet: string, rows: Rowed<T>[]) =>
      rows.forEach((r) => r.data.merchant_id !== merchant.merchant_id && bad(sheet, r.rowNumber, `merchant_id ${r.data.merchant_id} does not match ${merchant.merchant_id}`));
    sameMerchant("Customers", customers);
    sameMerchant("Products", products);
    sameMerchant("Sales", sales);
    sameMerchant("Sale_Items", items);
    sameMerchant("Credit_Entries", credit);
    sameMerchant("Credit_Policies", policies);
  }

  const customerIds = new Set(customers.map((c) => c.data.customer_id));
  const productIds = new Set(products.map((p) => p.data.product_id));
  const saleIds = new Set(sales.map((s) => s.data.sale_id));

  for (const { rowNumber, data: c } of customers) {
    const { opted_in_at: inAt, opted_out_at: outAt, consent_status: status } = c;
    if (inAt && outAt && outAt < inAt) bad("Customers", rowNumber, "opted_out_at is before opted_in_at");
    const derived = outAt ? "OPTED_OUT" : inAt ? "OPTED_IN" : "NOT_RECORDED";
    if (derived !== status) bad("Customers", rowNumber, `consent_status ${status} does not match opt-in/out timestamps (${derived})`);
  }

  for (const { rowNumber, data: p } of products) {
    if (p.selling_price < p.cost_price) bad("Products", rowNumber, `selling_price is below cost_price for ${p.product_id}`);
  }

  for (const { rowNumber, data: s } of sales) {
    if (s.customer_id && !customerIds.has(s.customer_id)) bad("Sales", rowNumber, `unknown customer_id ${s.customer_id}`);
    if (toPaise(s.gross_amount) - toPaise(s.discount_amount) !== toPaise(s.net_amount))
      bad("Sales", rowNumber, `net_amount ${s.net_amount} != gross ${s.gross_amount} - discount ${s.discount_amount}`);
  }

  const lineTotalBySale = new Map<string, number>();
  for (const { rowNumber, data: i } of items) {
    if (!saleIds.has(i.sale_id)) bad("Sale_Items", rowNumber, `unknown sale_id ${i.sale_id}`);
    if (!productIds.has(i.product_id)) bad("Sale_Items", rowNumber, `unknown product_id ${i.product_id}`);
    const expected = toPaise(i.quantity * i.unit_selling_price) - toPaise(i.line_discount);
    if (Math.abs(expected - toPaise(i.line_total)) > 1) bad("Sale_Items", rowNumber, `line_total ${i.line_total} != quantity x price - discount (${expected / 100})`);
    if (Math.abs(toPaise(i.quantity * i.unit_cost) - toPaise(i.line_cost)) > 1) bad("Sale_Items", rowNumber, `line_cost ${i.line_cost} != quantity x unit_cost`);
    lineTotalBySale.set(i.sale_id, (lineTotalBySale.get(i.sale_id) ?? 0) + toPaise(i.line_total));
  }
  for (const { rowNumber, data: s } of sales) {
    const lines = lineTotalBySale.get(s.sale_id);
    if (lines === undefined) bad("Sales", rowNumber, `sale ${s.sale_id} has no sale items`);
    else if (Math.abs(lines - toPaise(s.net_amount)) > 1) bad("Sales", rowNumber, `net_amount ${s.net_amount} != sum of line totals ${lines / 100}`);
  }

  const balance = new Map<string, number>();
  for (const { rowNumber, data: e } of [...credit].sort((a, b) => a.data.entry_date.getTime() - b.data.entry_date.getTime())) {
    if (!customerIds.has(e.customer_id)) bad("Credit_Entries", rowNumber, `unknown customer_id ${e.customer_id}`);
    const next = (balance.get(e.customer_id) ?? 0) + (e.entry_type === "CREDIT_GIVEN" ? 1 : -1) * toPaise(e.amount);
    if (next < 0) bad("Credit_Entries", rowNumber, `repayment of ${e.amount} for ${e.customer_id} exceeds outstanding balance`);
    balance.set(e.customer_id, next);
  }

  const summary = new Map<string, number>();
  for (const { data } of summaryRows) if (typeof data.value === "number") summary.set(data.metric, data.value);

  if (issues.length || !merchant) return { dataset: null, issues };
  return {
    dataset: {
      merchant,
      policy: policies[0]?.data ?? null,
      customers: customers.map((r) => r.data),
      products: products.map((r) => r.data),
      sales: sales.map((r) => r.data),
      saleItems: items.map((r) => r.data),
      credit: credit.map((r) => r.data),
      summary,
    },
    issues,
  };
}
