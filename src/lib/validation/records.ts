import { z } from "zod";
import { normalizePhone } from "@/lib/whatsapp";
import { MAX_AMOUNT_PAISE, rupees } from "./credit";

/**
 * Records a shop can create without the workbook: products, customers and sales (PRD 4, 10.2). The same schemas back
 * the API routes and the voice review card, so voice and typing go through one set of rules.
 */

export const SALE_PAYMENTS = ["CASH", "UPI", "PAYTM", "CARD", "UDHAAR"] as const;
export type SalePayment = (typeof SALE_PAYMENTS)[number];
export const SALE_PAYMENT_LABEL: Record<SalePayment, string> = { CASH: "Cash", UPI: "UPI", PAYTM: "Paytm", CARD: "Card", UDHAAR: "Udhaar (on credit)" };

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const idempotencyKey = z.string().trim().min(8, "Missing form token. Refresh the page.").max(100);
const id = z.string().trim().min(1).max(64);

/** Like `rupees`, but 0 is allowed (a free sample, or a cost the owner does not know yet). */
const rupeesOrZero = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : v),
  z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 40 or 40.50.")
    .transform((s) => Math.round(Number(s) * 100))
    .refine((p) => p <= MAX_AMOUNT_PAISE, "Amount is too large."),
);

export const productSchema = z.object({
  name: z.string().trim().min(2, "Enter the product name.").max(80, "Name is too long (80 characters max)."),
  category: z.preprocess(emptyToUndefined, z.string().trim().max(40, "Category is too long.").optional()),
  sellingPrice: rupees,
  costPrice: rupeesOrZero,
  idempotencyKey,
});
export type ProductInput = z.infer<typeof productSchema>;

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(60, "Name is too long (60 characters max)."),
  phone: z.preprocess(emptyToUndefined, z.string().trim().max(20).refine((p) => normalizePhone(p) !== null, "Enter a valid mobile number, like 98765 43210.").optional()),
  preferredLanguage: z.enum(["HINDI", "HINGLISH", "ENGLISH"]).default("HINGLISH"),
  /** Only true when the owner ticks that the customer agreed to receive WhatsApp messages (PRD 9.3). */
  consent: z.boolean().default(false),
  idempotencyKey,
});
export type CustomerInput = z.infer<typeof customerSchema>;

const quantity = z.coerce.number().positive("Quantity must be more than 0.").max(10_000, "Quantity is too large.").refine((q) => Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-6, "Use up to 3 decimals.");

export const saleSchema = z
  .object({
    items: z
      .array(z.object({ productId: id, quantity, unitPrice: rupeesOrZero }))
      .min(1, "Add at least one item.")
      .max(30, "Too many items in one bill (30 max)."),
    customerId: z.preprocess(emptyToUndefined, id.optional()),
    payment: z.enum(SALE_PAYMENTS),
    discount: z.preprocess(emptyToUndefined, rupeesOrZero.optional()),
    /** Udhaar sales only: when the customer should pay. */
    dueDate: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.").optional()),
    idempotencyKey,
  })
  .superRefine((v, ctx) => {
    if (v.payment === "UDHAAR" && !v.customerId) ctx.addIssue({ code: "custom", path: ["customerId"], message: "Choose the customer for an udhaar sale." });
    if (v.payment !== "UDHAAR" && v.dueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Only an udhaar sale has a due date." });
  });
export type SaleInput = z.infer<typeof saleSchema>;

/* ---------- Voice drafts: what the review card is pre-filled with. Nothing here is saved until the owner taps Save. ---------- */

export type CatalogItem = { id: string; name: string; category: string | null; pricePaise: number; costPaise: number };
export type PersonMatch = { id: string; name: string; phone: string | null };

export type ProductDraft = { kind: "PRODUCT"; name: string; category?: string; sellingPaise?: number; costPaise?: number; existing: CatalogItem[] };
export type CustomerDraft = { kind: "CUSTOMER"; name: string; phone?: string; existing: PersonMatch[] };
export type SaleDraftLine = { heard: string; quantity: number; unitPaise?: number; productId?: string; options: CatalogItem[] };
export type SaleDraft = { kind: "SALE"; lines: SaleDraftLine[]; payment?: SalePayment; customerHeard?: string; customers: PersonMatch[]; spokenTotalPaise?: number };
export type RecordDraft = ProductDraft | CustomerDraft | SaleDraft;
