import "server-only";
import { env } from "@/lib/env";
import { extractJson, sarvamChat } from "@/server/sarvam/client";
import { rejectReason, whyRejectReason, type MessageFacts, type TextProvider } from "./text";

const LANGUAGE = { ENGLISH: "English", HINGLISH: "Hinglish (Hindi written in Roman script)", HINDI: "Hindi in Devanagari script" } as const;
const TONE = { standard: "polite and warm", softer: "very soft, warm and unhurried, with no pressure" } as const;

/**
 * Shared hard rules for customer copy. Every reply is re-checked by rejectReason(); any breach falls back to the
 * template, so a vague prompt only wastes credits. Keep these rules exact.
 */
const MESSAGE_RULES = [
  "HARD RULES:",
  "1. Use ONLY the facts given. Never add offers, conditions, fees, phone numbers, links, emojis or hashtags.",
  "2. Write {name} exactly once where the customer's name goes. Do not write any real name.",
  "3. If the facts include a coupon, write the words 'code {code}' exactly where the coupon code goes (e.g. 'use code {code}'). Never write or invent a code.",
  "4. Copy every amount (₹), percentage, date and time exactly as given, character for character. Write no other number.",
  "5. Plain text, 1 or 2 sentences, at most 45 words. Language and tone exactly as requested.",
].join("\n");

const SYSTEM = [
  "Role: you write one WhatsApp message from a small Indian shop (kirana) to one customer.",
  MESSAGE_RULES,
  "OUTPUT: only the message text. No quotes, no greeting label, no explanation, no translation, no alternatives.",
].join("\n");

const KIND_BRIEF: Record<MessageFacts["kind"], string> = {
  CREDIT_REMINDER: "a gentle payment reminder for pending udhaar (credit)",
  LOYALTY_COUPON: "a thank-you coupon for a loyal regular customer",
  LOYALTY_COMBO: "a special combo offer for a loyal regular customer",
  LOYALTY_CREDIT: "telling a trusted customer they can now buy on udhaar (credit) up to a limit",
  FESTIVE: "a festival greeting with an offer",
  OFF_PEAK: "a happy-hour offer valid only in a specific weekday time window",
  WINBACK: "a 'we miss you' offer for a customer who has not visited for a while",
  BUNDLE: "a combo offer on products often bought together",
};

/** The fact lines a model sees: only pre-formatted strings, never raw numbers to compute with. */
const META = new Set(["kind", "language", "tone", "offer", "codeMode"]);
function factLines(f: MessageFacts): string[] {
  const lines = Object.entries(f).flatMap(([k, v]) => (META.has(k) ? [] : [`${k}: ${String(v)}`]));
  return f.kind !== "CREDIT_REMINDER" && f.kind !== "LOYALTY_CREDIT" && f.offer === "coupon" ? [...lines, "couponCode: write {code} (the shop fills the real code later)"] : lines;
}

/** Sarvam AI wording for one message. Returns null (so the next provider runs) on any failure or unsafe output. */
export const sarvamProvider: TextProvider = {
  name: "sarvam",
  async compose(facts: MessageFacts) {
    const user = `Purpose: ${KIND_BRIEF[facts.kind]}\nLanguage: ${LANGUAGE[facts.language]}\nTone: ${TONE[facts.tone]}\nFacts:\n${factLines(facts).join("\n")}`;
    const text = await sarvamChat({ model: env.SARVAM_CHAT_MODEL, system: SYSTEM, user, maxTokens: 160, temperature: 0.3 });
    if (!text) return null;
    const reason = rejectReason(text, facts);
    if (reason) {
      console.warn(`sarvam: reply rejected (${reason}); using template`);
      return null;
    }
    return text;
  },
};

export type BatchItem = { facts: MessageFacts | null; evidence: string[] };
export type BatchReply = { message: string | null; why: string | null };

const BATCH_SYSTEM = [
  "Role: you write the wording for a small Indian shop's growth tips. All numbers are already decided; you only phrase them.",
  "For EACH item write two things:",
  "A) message: a WhatsApp message to the customer, following the hard rules below. If the item says 'Message: none', use null.",
  "B) why: 1 or 2 short sentences, ALWAYS in simple English (whatever the message language), for the shop owner explaining why this tip makes sense.",
  "   The 'why' may use ONLY numbers that appear in that item's evidence lines, copied exactly. No promises, no 'guaranteed', no new figures. At most 40 words.",
  MESSAGE_RULES,
  "OUTPUT: one JSON array and nothing else (no markdown, no code fence, no commentary). One object per item, same order:",
  '[{"i":0,"message":"...","why":"..."},{"i":1,"message":null,"why":"..."}]',
].join("\n");

/**
 * One Sarvam request for a whole batch of tips. Each reply item is validated on its own (message: rejectReason,
 * why: whyRejectReason); a failed item comes back as nulls so the caller uses the template for just that item.
 * Returns null when the request itself failed.
 */
export async function sarvamBatch(items: BatchItem[]): Promise<BatchReply[] | null> {
  const user = items
    .map((it, i) =>
      [
        `Item ${i}:`,
        it.facts ? `Message purpose: ${KIND_BRIEF[it.facts.kind]} | language: ${LANGUAGE[it.facts.language]} | tone: ${TONE[it.facts.tone]}` : "Message: none (in-store tip)",
        ...(it.facts ? ["Facts:", ...factLines(it.facts).map((l) => `  ${l}`)] : []),
        "Evidence lines (for 'why', which must be written in English):",
        ...it.evidence.map((e) => `  - ${e}`),
      ].join("\n"),
    )
    .join("\n\n");
  // ~45-word message + ~40-word why per item; the cap stops a runaway reply from burning credits.
  const text = await sarvamChat({ model: env.SARVAM_CHAT_MODEL, system: BATCH_SYSTEM, user, maxTokens: 220 * items.length + 60, temperature: 0.3, timeoutMs: 25_000 });
  if (!text) return null;
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) {
    console.warn("sarvam: batch reply was not a JSON array; using templates");
    return null;
  }
  return items.map((it, i) => {
    const row = parsed.find((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object" && Number((r as { i?: unknown }).i) === i);
    const message = typeof row?.message === "string" ? row.message.trim() : null;
    const why = typeof row?.why === "string" ? row.why.trim() : null;
    const msgReason = it.facts && message ? rejectReason(message, it.facts) : "missing";
    const whyReason = why ? whyRejectReason(why, it.evidence) : "missing";
    if (it.facts && msgReason) console.warn(`sarvam: batch item ${i} message rejected (${msgReason}); using template`);
    if (whyReason) console.warn(`sarvam: batch item ${i} why rejected (${whyReason}); using template`);
    return { message: it.facts && !msgReason ? message : null, why: whyReason ? null : why };
  });
}
