import { z } from "zod";
import { badOrigin } from "@/server/api/json-route";
import { getApiMerchantAccess } from "@/server/merchant/access";
import { sarvamEnabled, sarvamTranscribe } from "@/server/sarvam/client";

const MAX_BYTES = 2_000_000;
const languageSchema = z.enum(["hi-IN", "en-IN", "unknown"]).catch("unknown");

/** Multipart { audio, language } → Saaras v3 transcript. 503 tells the client to fall back to browser speech recognition. */
export async function POST(request: Request) {
  const access = await getApiMerchantAccess();
  if ("error" in access) return access.error;
  if (badOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!sarvamEnabled()) return Response.json({ error: "Speech service is not configured." }, { status: 503 });
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return Response.json({ error: "Send audio as multipart form data" }, { status: 415 });
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No audio received." }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "Recording is too long. Keep it under 15 seconds." }, { status: 413 });
  if (!/^audio\//.test(audio.type)) return Response.json({ error: "Unsupported audio type." }, { status: 415 });
  const r = await sarvamTranscribe(audio, languageSchema.parse(form?.get("language")));
  if (!r) return Response.json({ error: "Could not transcribe. Try again or type instead." }, { status: 502 });
  return Response.json(r);
}
