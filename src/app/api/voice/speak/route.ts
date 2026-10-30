import { createHash } from "node:crypto";
import { speakSchema } from "@/lib/validation/tips";
import { jsonWrite } from "@/server/api/json-route";
import { BCP47, Lru, sarvamEnabled, sarvamSpeak } from "@/server/sarvam/client";

/** Read-back audio is cached by exact text, so the same answer is never synthesised twice. */
const cache = new Lru<Uint8Array>(100);

/** POST { text, language } → Bulbul v3 WAV audio. 503 tells the client to fall back to browser speech synthesis. */
export async function POST(request: Request) {
  const w = await jsonWrite(request, speakSchema);
  if ("error" in w) return w.error;
  if (!sarvamEnabled()) return Response.json({ error: "Speech service is not configured." }, { status: 503 });
  const key = createHash("sha256").update(`${w.body.language}:${w.body.text}`).digest("hex");
  const audio = cache.get(key) ?? (await sarvamSpeak(w.body.text, BCP47[w.body.language]));
  if (!audio) return Response.json({ error: "Could not create speech." }, { status: 502 });
  cache.set(key, audio);
  return new Response(new Blob([audio as BlobPart], { type: "audio/wav" }), { headers: { "Cache-Control": "private, max-age=3600" } });
}
