import { z } from "zod";

export const MAX_AMOUNT_PAISE = 1_00_00_000 * 100; // 1 crore rupees

export const PAYMENT_METHODS = ["CASH", "PAYTM", "UPI", "CARD", "OTHER"] as const;

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Accepts "500", "500.5", "500.50" (or a JSON number) and returns integer paise. */
const rupees = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : v),
  z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 500 or 500.50.")
    .transform((s) => Math.round(Number(s) * 100))
    .refine((p) => p > 0, "Amount must be greater than 0.")
    .refine((p) => p <= MAX_AMOUNT_PAISE, "Amount is too large."),
);

const ymd = z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.").optional());
const note = z.preprocess(emptyToUndefined, z.string().trim().max(200, "Note is too long (200 characters max).").optional());
const idempotencyKey = z.string().trim().min(8, "Missing form token. Refresh the page.").max(100);
const id = z.string().trim().min(1).max(64);

export const creditEntrySchema = z
  .object({
    customerId: id,
    type: z.enum(["CREDIT_GIVEN", "REPAYMENT_RECEIVED"]),
    amount: rupees,
    entryDate: ymd,
    dueDate: ymd,
    paymentMethod: z.preprocess(emptyToUndefined, z.enum(PAYMENT_METHODS).optional()),
    note,
    idempotencyKey,
  })
  .superRefine((v, ctx) => {
    if (v.type === "REPAYMENT_RECEIVED") {
      if (!v.paymentMethod) ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Choose how the customer paid." });
      if (v.dueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "A repayment has no due date." });
    }
    if (v.type === "CREDIT_GIVEN" && v.paymentMethod) ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Credit given has no payment method." });
    if (v.entryDate && v.dueDate && v.dueDate < v.entryDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date cannot be before the credit date." });
  });

export const correctionSchema = z.object({
  customerId: id,
  targetEntryId: z.string().trim().min(1, "Choose the entry to correct.").max(64),
  amount: rupees,
  reason: z.string().trim().min(3, "Give a short reason (at least 3 characters).").max(200, "Reason is too long (200 characters max)."),
  idempotencyKey,
});

export const ledgerFilterSchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(["all", "outstanding", "overdue", "upcoming", "settled"]).default("outstanding")),
});

export type CreditEntryInput = z.infer<typeof creditEntrySchema>;
export type CorrectionInput = z.infer<typeof correctionSchema>;
