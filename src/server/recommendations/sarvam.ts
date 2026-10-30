import "server-only";
import { env } from "@/lib/env";
import { extractJson, sarvamChat } from "@/server/sarvam/client";
import { rejectReason, whyRejectReason, type MessageFacts, type TextProvider } from "./text";

const LANGUAGE = { ENGLISH: "English", HINGLISH: "Hinglish (Hindi written in Roman script)", HINDI: "Hindi in Devanagari script" } as const;
const TONE = { standard: "polite and warm", softer: "very soft, warm and unhurried, with no pressure" } as const;

const RULES =
  "Use ONLY the facts given. Keep the exact text {name} as a placeholder for the customer's name. Copy every amount, percentage, date, " +
  "time and coupon code exactly as given. Do not invent numbers, dates, discounts, fees, conditions or links.";

const SYSTEM = `You write short WhatsApp messages for a small Indian shop. ${RULES} Reply with the message only, no quotes, no explanation.`;

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
function factLines(f: MessageFacts): string[] {
  const { kind: _k, language: _l, tone: _t, ...rest } = f;
  return Object.entries(rest).map(([k, v]) => `${k}: ${String(v)}`);
}

/** Sarvam AI wording for one message. Returns null (so the next provider runs) on any failure or unsafe output. */
export const sarvamProvider: TextProvider = {
  name: "sarvam",
  async compose(facts: MessageFacts) {
    const user = `Write ${KIND_BRIEF[facts.kind]}.\nLanguage: ${LANGUAGE[facts.language]}\nTone: ${TONE[facts.tone]}\n${factLines(facts).join("\n")}\nMaximum 45 words.`;
    const text = await sarvamChat({ model: env.SARVAM_CHAT_MODEL, system: SYSTEM, user, maxTokens: 300 });
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

const BATCH_SYSTEM =
  "You write copy for a small Indian shop's growth tips. For each item return a customer WhatsApp message (when facts are given) " +
  `and a 1-2 sentence 'why' for the shop owner. ${RULES} The 'why' may only restate numbers from that item's evidence. ` +
  'Reply with a JSON array only: [{"i": <item number>, "message": "<text or null>", "why": "<text>"}].';

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
        it.facts ? `Message: ${KIND_BRIEF[it.facts.kind]}; language ${LANGUAGE[it.facts.language]}; tone ${TONE[it.facts.tone]}; maximum 50 words.` : "Message: none (in-store tip), return null.",
        ...(it.facts ? factLines(it.facts).map((l) => `  ${l}`) : []),
        "Evidence for 'why' (English):",
        ...it.evidence.map((e) => `  - ${e}`),
      ].join("\n"),
    )
    .join("\n\n");
  const text = await sarvamChat({ model: env.SARVAM_CHAT_MODEL, system: BATCH_SYSTEM, user, maxTokens: 400 * items.length + 200, timeoutMs: 25_000 });
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
