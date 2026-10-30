import { z } from "zod";

// Excel stores local clock times without a timezone. exceljs returns them as if they were UTC,
// so we shift by the merchant's offset (Asia/Kolkata = UTC+05:30, no daylight saving).
const IST_OFFSET_MS = 330 * 60_000;
export const SUPPORTED_TIMEZONE = "Asia/Kolkata";

const str = z.string().trim().min(1, "is required");
const optStr = z.string().trim().nullish().transform((v) => (v ? v : null));
const num = z.number().finite();
const money = num.nonnegative("must be 0 or more");
const flag = z.union([z.boolean(), z.number()]).transform(Boolean);
const date = z.date().transform((d) => new Date(d.getTime() - IST_OFFSET_MS));
const optDate = z.date().nullish().transform((d) => (d ? new Date(d.getTime() - IST_OFFSET_MS) : null));

export const merchantRow = z.object({
  merchant_id: str,
  merchant_name: str,
  business_type: z.enum(["KIRANA", "PHARMACY", "RESTAURANT", "APPAREL", "ELECTRONICS", "SALON", "OTHER"]),
  city: optStr,
  state: optStr,
  timezone: str,
  is_demo: flag,
});

export const customerRow = z.object({
  customer_id: str,
  merchant_id: str,
  customer_name: str,
  phone_number: optStr,
  preferred_language: z.enum(["HINDI", "HINGLISH", "ENGLISH"]),
  joined_date: optDate,
  opted_in_at: optDate,
  opted_out_at: optDate,
  is_synthetic: flag,
  consent_status: z.enum(["OPTED_IN", "OPTED_OUT", "NOT_RECORDED"]),
});

export const productRow = z.object({
  product_id: str,
  merchant_id: str,
  product_name: str,
  category: optStr,
  cost_price: money,
  selling_price: money,
});

export const saleRow = z.object({
  sale_id: str,
  merchant_id: str,
  customer_id: optStr,
  sale_date: date,
  payment_method: z.enum(["PAYTM", "UPI", "CASH", "CARD", "OTHER"]),
  payment_status: z.enum(["PAID", "CREDIT", "PENDING"]),
  sale_status: z.enum(["COMPLETED", "CANCELLED", "REFUNDED"]),
  gross_amount: money,
  discount_amount: money,
  net_amount: money,
  paytm_transaction_id: optStr,
  invoice_number: optStr,
  transaction_completed_at: optDate,
  coupon_code: optStr,
  discount_reason: z.enum(["NONE", "COUPON", "MERCHANT_DISCOUNT"]),
});

export const saleItemRow = z.object({
  sale_item_id: str,
  merchant_id: str,
  sale_id: str,
  product_id: str,
  quantity: num.positive("must be greater than 0"),
  unit_selling_price: money,
  line_discount: money,
  line_total: money,
  unit_cost: money,
  line_cost: money,
});

export const creditRow = z.object({
  ledger_entry_id: str,
  merchant_id: str,
  customer_id: str,
  entry_type: z.enum(["CREDIT_GIVEN", "REPAYMENT_RECEIVED"]),
  entry_date: date,
  amount: num.positive("must be greater than 0"),
  due_date: optDate,
  payment_method: z.enum(["PAYTM", "UPI", "CASH", "CARD", "OTHER"]).nullish().transform((v) => v ?? null),
  note: optStr,
  reason: optStr,
});

export const policyRow = z.object({
  policy_id: str,
  merchant_id: str,
  policy_name: str,
  grace_period_days: z.number().int().nonnegative(),
  late_fee_amount_inr: money,
  penalty_enabled: flag,
  policy_note: optStr,
});

export const summaryRow = z.object({ metric: str, value: z.union([z.number(), z.string()]) });

export type MerchantRow = z.infer<typeof merchantRow>;
export type CustomerRow = z.infer<typeof customerRow>;
export type ProductRow = z.infer<typeof productRow>;
export type SaleRow = z.infer<typeof saleRow>;
export type SaleItemRow = z.infer<typeof saleItemRow>;
export type CreditRow = z.infer<typeof creditRow>;
export type PolicyRow = z.infer<typeof policyRow>;

/** Integer paise avoids floating-point drift when comparing or summing money. */
export const toPaise = (n: number) => Math.round(n * 100);
export const toMoney = (n: number) => (toPaise(n) / 100).toFixed(2);
export const toQty = (n: number) => n.toFixed(3);
