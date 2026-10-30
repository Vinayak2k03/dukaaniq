import "server-only";
import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(blank, z.string().min(1).optional());

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  SARVAM_API_KEY: optionalString,
  /** Customer-facing wording and merchant "why" text (one batch call per set of tips). */
  SARVAM_CHAT_MODEL: z.preprocess(blank, z.string().min(1).default("sarvam-105b-conversations")),
  /** Structured parsing: voice intents the keyword matcher could not place, and free-text feedback notes. */
  SARVAM_REASONING_MODEL: z.preprocess(blank, z.string().min(1).default("sarvam-105b")),
  /** Speech to text for the merchant's voice commands. */
  SARVAM_STT_MODEL: z.preprocess(blank, z.string().min(1).default("saaras:v3")),
  /** Text to speech for spoken read-back. */
  SARVAM_TTS_MODEL: z.preprocess(blank, z.string().min(1).default("bulbul:v3")),
  /** Optional Bulbul voice; the API default is used when empty. */
  SARVAM_TTS_SPEAKER: optionalString,
  /** Hard cap on LLM calls per tips session; beyond it, templates are used silently. */
  SARVAM_MAX_CALLS_PER_SESSION: z.preprocess(blank, z.coerce.number().int().min(0).max(50).default(6)),
  /** Margin floor for any discount or combo price: price after discount >= cost × (1 + MIN_MARGIN_PCT / 100). */
  MIN_MARGIN_PCT: z.preprocess(blank, z.coerce.number().min(0).max(100).default(5)),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
  throw new Error(
    `Invalid or missing environment variables: ${names.join(", ")}. See .env.example.`,
  );
}

export const env = parsed.data;
