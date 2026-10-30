import "server-only";
import { env } from "@/lib/env";

/**
 * Thin Sarvam AI client. Every function returns null on any failure (no key, HTTP error, timeout, bad
 * payload) so callers fall back to templates or the browser. Never logs request content or keys.
 *
 * Models (configurable in env.ts):
 * - chat: sarvam-105b-conversations (wording), sarvam-105b (structured parsing)
 * - speech to text: saaras:v3
 * - text to speech: bulbul:v3
 */

const BASE = "https://api.sarvam.ai";

export const sarvamEnabled = () => Boolean(env.SARVAM_API_KEY);

/** Logs a content-free failure reason and returns null so callers fall back. */
const warn = (what: string, detail: string): null => {
  console.warn(`sarvam ${what}: ${detail}; using fallback`);
  return null;
};

/** Sarvam's own error message for a failed call (never the request content), truncated for logs. */
const errorDetail = async (res: Response) => (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);

/** Removes reasoning blocks and code fences some models wrap around their answer. */
export const cleanReply = (t: string) =>
  t
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

type ChatArgs = {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  /** null turns off hidden reasoning (sarvam-105b), which otherwise spends hundreds of tokens before answering. */
  reasoningEffort?: "low" | "medium" | "high" | null;
};

export async function sarvamChat(a: ChatArgs): Promise<string | null> {
  const key = env.SARVAM_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: a.model, messages: [{ role: "system", content: a.system }, { role: "user", content: a.user }], temperature: a.temperature ?? 0.3, max_tokens: a.maxTokens, ...(a.reasoningEffort !== undefined ? { reasoning_effort: a.reasoningEffort } : {}) }),
      signal: AbortSignal.timeout(a.timeoutMs ?? 8_000),
    });
    if (!res.ok) return warn("chat", `HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const text = cleanReply(data.choices?.[0]?.message?.content ?? "");
    return text || warn("chat", "empty reply");
  } catch (e) {
    return warn("chat", e instanceof Error ? e.name : "error");
  }
}

/** Finds and parses the first JSON value (object or array) in a model reply. */
export function extractJson(text: string): unknown {
  const starts = [text.indexOf("["), text.indexOf("{")].filter((i) => i >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Structured parsing with the reasoning model. The caller must validate the result with Zod. */
export async function sarvamJson(system: string, user: string): Promise<unknown> {
  // Classification into a fixed JSON shape needs no hidden reasoning: with it off the answer is ~20-60 tokens
  // (measured), so a 200-token cap is ample and a runaway reply cannot burn credits.
  const text = await sarvamChat({ model: env.SARVAM_REASONING_MODEL, system, user, maxTokens: 200, temperature: 0, timeoutMs: 10_000, reasoningEffort: null });
  return text ? extractJson(text) : null;
}

export const BCP47 = { HINDI: "hi-IN", HINGLISH: "hi-IN", ENGLISH: "en-IN" } as const;

/** Saaras v3 speech to text. `languageCode` "unknown" lets the model detect Hindi / English / code-mixed speech. */
export async function sarvamTranscribe(audio: Blob, languageCode: string): Promise<{ transcript: string; languageCode: string | null } | null> {
  const key = env.SARVAM_API_KEY;
  if (!key) return null;
  const form = new FormData();
  // Browsers label recordings "audio/webm;codecs=opus"; Sarvam only accepts the bare type and answers HTTP 400 otherwise.
  const bare = new Blob([audio], { type: audio.type.split(";")[0].trim() || "application/octet-stream" });
  form.append("file", bare, `speech.${audio.type.includes("wav") ? "wav" : audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "mp4" : "webm"}`);
  form.append("model", env.SARVAM_STT_MODEL);
  form.append("language_code", languageCode);
  form.append("mode", "transcribe");
  try {
    const res = await fetch(`${BASE}/speech-to-text`, { method: "POST", headers: { "api-subscription-key": key }, body: form, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return warn("stt", `HTTP ${res.status} ${await errorDetail(res)} (audio ${audio.type || "no type"}, ${audio.size} bytes, language ${languageCode})`);
    const data = (await res.json()) as { transcript?: string; language_code?: string | null };
    const transcript = data.transcript?.trim();
    return transcript ? { transcript, languageCode: data.language_code ?? null } : warn("stt", "empty transcript");
  } catch (e) {
    return warn("stt", e instanceof Error ? e.name : "error");
  }
}

/** Bulbul v3 text to speech. Returns WAV bytes. */
export async function sarvamSpeak(text: string, languageCode: string): Promise<Uint8Array | null> {
  const key = env.SARVAM_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}/text-to-speech`, {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, target_language_code: languageCode, model: env.SARVAM_TTS_MODEL, ...(env.SARVAM_TTS_SPEAKER ? { speaker: env.SARVAM_TTS_SPEAKER } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return warn("tts", `HTTP ${res.status}`);
    const data = (await res.json()) as { audios?: string[] };
    const b64 = data.audios?.[0];
    return b64 ? new Uint8Array(Buffer.from(b64, "base64")) : warn("tts", "no audio");
  } catch (e) {
    return warn("tts", e instanceof Error ? e.name : "error");
  }
}

/** Small in-memory LRU so identical requests are never sent twice by this server process. */
export class Lru<V> {
  private map = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string) {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: string, v: V) {
    this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
}
