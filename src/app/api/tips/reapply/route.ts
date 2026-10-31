import { tipReapplySchema } from "@/lib/validation/tips";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { reapplyTip } from "@/server/tips/reapply";

/**
 * POST { recommendationId }: the owner asks to reapply a tip they approved earlier. A fresh version is rebuilt from today's
 * numbers and saved as a pending proposal; nothing is approved or sent until they approve it in the Action Centre.
 */
export async function POST(request: Request) {
  const w = await jsonWrite(request, tipReapplySchema, { ownerOnly: true });
  if ("error" in w) return w.error;
  try {
    const r = await reapplyTip(w.access.merchant, actorOf(w.access), w.body.recommendationId);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ ok: true, recommendationId: r.recommendationId, duplicate: r.duplicate });
  } catch (e) {
    console.error("tip reapply api failed:", e);
    return Response.json({ error: "Could not reapply this tip. Please try again." }, { status: 500 });
  }
}
