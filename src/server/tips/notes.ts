import "server-only";
import { sarvamEnabled, sarvamJson } from "@/server/sarvam/client";
import { applyNote, applySignal, keywordNote, noteFeedbackSchema } from "./feedback";
import { TIP_FAMILIES, type TipContext, type TipFeedback } from "./types";

/** Structured extraction only. The reply is Zod-validated (noteFeedbackSchema); anything else is discarded. */
const SYSTEM = [
  "Role: you convert a shop owner's short feedback about business tips (Hindi, Hinglish or English) into JSON settings.",
  "RULES:",
  "1. Use only the allowed family names and shop categories given in the input. Never invent values.",
  "2. Fill a field ONLY if the owner clearly said it. Otherwise use [] or null. Do not guess.",
  "3. maxDiscountPct: a whole number only if the owner named a percentage or said the discount should be at most N%.",
  "4. excludeCustomerNames: only names the owner explicitly said to leave out.",
  "5. timing: \"later\" if they want the offer to start later, \"earlier\" if sooner, else null.",
  "Families: LOYALTY=loyal/regular customers, FESTIVE=festival offers, OFF_PEAK=quiet hours, CREDIT_REMINDER=udhaar reminders, WINBACK=customers who stopped coming, BUNDLE=combos, SLOW_MOVING=slow products, PEAK_TIMING=busy-hour stock tips.",
  "OUTPUT: exactly one JSON object, no markdown, no explanation:",
  '{"excludeFamilies":[],"preferFamilies":[],"maxDiscountPct":null,"excludeCustomerNames":[],"excludeCategories":[],"timing":null}',
  'Example: "combo mat do, sirf loyal walo ke liye, discount 5% se zyada nahi" -> {"excludeFamilies":["BUNDLE"],"preferFamilies":["LOYALTY"],"maxDiscountPct":5,"excludeCustomerNames":[],"excludeCategories":[],"timing":null}',
].join("\n");

/**
 * Free-text feedback note → structured feedback. A free keyword pass runs first; the reasoning model
 * (one call) is used only when keywords find nothing and the session still has LLM budget. Invalid model
 * output is ignored. Returns the new feedback and how many LLM calls were made.
 */
export async function applyFreeText(fb: TipFeedback, note: string, ctx: TipContext, allowLlm: boolean): Promise<{ feedback: TipFeedback; llmCalls: number }> {
  const known = { categories: [...new Set(ctx.products.flatMap((p) => (p.category ? [p.category] : [])))], customers: ctx.customers.map((c) => ({ id: c.id, name: c.name })) };
  const kw = keywordNote(note);
  if (kw) return { feedback: applyNote(kw.reasons.reduce((f, r) => applySignal(f, r), fb), kw.note, known), llmCalls: 0 };
  if (!allowLlm || !sarvamEnabled()) return { feedback: fb, llmCalls: 0 };
  const user = `Allowed families: ${TIP_FAMILIES.join(", ")}\nShop categories: ${known.categories.join(", ")}\nFeedback: ${note.slice(0, 300)}`;
  const parsed = noteFeedbackSchema.safeParse(await sarvamJson(SYSTEM, user));
  if (!parsed.success) {
    console.warn("tips: feedback note could not be parsed; ignored");
    return { feedback: fb, llmCalls: 1 };
  }
  return { feedback: applyNote(fb, parsed.data, known), llmCalls: 1 };
}
