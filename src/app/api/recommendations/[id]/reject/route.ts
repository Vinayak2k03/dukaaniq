import { rejectApiSchema } from "@/lib/validation/tips";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { rejectRecommendation } from "@/server/recommendations/service";
import { feedRejectionToSession } from "@/server/tips/service";

export async function POST(request: Request, ctx: RouteContext<"/api/recommendations/[id]/reject">) {
  const w = await jsonWrite(request, rejectApiSchema, { ownerOnly: true });
  if ("error" in w) return w.error;
  const { id } = await ctx.params;
  const reason = w.body.reason;
  try {
    const r = await rejectRecommendation(w.access.merchant, actorOf(w.access), { recommendationId: id, version: w.body.version, reason, note: w.body.note });
    if (!r.ok) return Response.json({ error: r.error }, { status: r.error === "Recommendation not found." ? 404 : 409 });
    await feedRejectionToSession(w.access.merchant, id, reason, w.body.note);
    return Response.json({ ok: true, status: "REJECTED" });
  } catch (e) {
    console.error("reject api failed:", e);
    return Response.json({ error: "Could not reject." }, { status: 500 });
  }
}
