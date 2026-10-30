import "server-only";
import { env } from "@/lib/env";
import { rejectReason, type MessageFacts, type TextProvider } from "./text";

const ENDPOINT = "https://api.sarvam.ai/v1/chat/completions";
const MODEL = "sarvam-105b-conversations";
const TIMEOUT_MS = 8_000;

const LANGUAGE = { ENGLISH: "English", HINGLISH: "Hinglish (Hindi written in Roman script)", HINDI: "Hindi in Devanagari script" } as const;
const TONE = { standard: "polite and gentle", softer: "very soft, warm and unhurried, with no pressure" } as const;

const SYSTEM =
  "You write short WhatsApp payment reminders for a small Indian shop. Use ONLY the facts given. " +
  "Keep the exact text {name} as a placeholder for the customer's name. Write the amount and the date exactly as given. " +
  "Do not invent numbers, dates, discounts, fees or links. Reply with the message only, no quotes, no explanation.";

/** Sarvam AI wording. Returns null (so the next provider runs) on any failure or unsafe output; never logs content or keys. */
export const sarvamProvider: TextProvider = {
  name: "sarvam",
  async compose(facts: MessageFacts) {
    const key = env.SARVAM_API_KEY;
    if (!key) return null;
    const user = `Language: ${LANGUAGE[facts.language]}\nTone: ${TONE[facts.tone]}\nShop: ${facts.shopName}\nAmount pending: ${facts.amountRupees}\nPending since: ${facts.dueDate}\nMaximum 45 words.`;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "api-subscription-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }], temperature: 0.3, max_tokens: 300 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`sarvam: request failed with HTTP ${res.status}; using template`);
        return null;
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        console.warn("sarvam: empty reply; using template");
        return null;
      }
      const reason = rejectReason(text, facts);
      if (reason) {
        console.warn(`sarvam: reply rejected (${reason}); using template`);
        return null;
      }
      return text;
    } catch (e) {
      console.warn(`sarvam: ${e instanceof Error ? e.name : "error"}; using template`);
      return null;
    }
  },
};
