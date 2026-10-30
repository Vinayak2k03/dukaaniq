import "server-only";
import { sarvamEnabled, sarvamJson } from "@/server/sarvam/client";
import { applyNote, applySignal, keywordNote, noteFeedbackSchema } from "./feedback";
import { TIP_FAMILIES, type TipContext, type TipFeedback } from "./types";

const SYSTEM =
  "You turn a shop owner's feedback about growth tips (Hindi, Hinglish or English) into JSON. Only use the allowed values. " +
  'Reply with one JSON object: {"excludeFamilies": [], "preferFamilies": [], "maxDiscountPct": number|null, ' +
  '"excludeCustomerNames": [], "excludeCategories": [], "timing": "later"|"earlier"|null}. Leave anything not mentioned empty or null.';

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
