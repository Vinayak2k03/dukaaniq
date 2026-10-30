import { voiceIntentSchema } from "@/lib/validation/tips";
import { jsonWrite } from "@/server/api/json-route";
import { interpret } from "@/server/voice/service";

/** POST { text, language } → { intent, params, confidence, needsConfirmation }. Interpreting never writes anything. */
export async function POST(request: Request) {
  const w = await jsonWrite(request, voiceIntentSchema);
  if ("error" in w) return w.error;
  try {
    return Response.json(await interpret(w.access.merchant.id, w.body.text));
  } catch (e) {
    console.error("voice intent failed:", e);
    return Response.json({ error: "Could not understand that. Please type it instead." }, { status: 500 });
  }
}
