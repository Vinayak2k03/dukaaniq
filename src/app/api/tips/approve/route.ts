import { tipApproveSchema } from "@/lib/validation/tips";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { approveTip } from "@/server/tips/service";

/**
 * POST { sessionId, key, confirmed: true }: the owner approves a tip shown on the tips screen. Only now is it saved as a
 * recommendation (already approved, coupon codes created). Nothing is sent to a customer from here.
 */
export async function POST(request: Request) {
  const w = await jsonWrite(request, tipApproveSchema, { ownerOnly: true });
  if ("error" in w) return w.error;
  try {
    const r = await approveTip(w.access.merchant, actorOf(w.access), w.body);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ ok: true, recommendationId: r.recommendationId, duplicate: r.duplicate });
  } catch (e) {
    console.error("tip approve api failed:", e);
    return Response.json({ error: "Could not approve this tip. Please try again." }, { status: 500 });
  }
}
