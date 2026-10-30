import { tipFeedbackSchema } from "@/lib/validation/tips";
import { jsonWrite } from "@/server/api/json-route";
import { recordTipFeedback } from "@/server/tips/service";

/** POST { sessionId, recommendationId?, reason?, note? }: stores feedback for the next batch (no tips are created). */
export async function POST(request: Request) {
  const w = await jsonWrite(request, tipFeedbackSchema, { ownerOnly: true });
  if ("error" in w) return w.error;
  const { sessionId, reason, ...rest } = w.body;
  try {
    const r = await recordTipFeedback(w.access.merchant, sessionId, { ...rest, reason });
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json(r);
  } catch (e) {
    console.error("tip feedback api failed:", e);
    return Response.json({ error: "Could not save feedback." }, { status: 500 });
  }
}
