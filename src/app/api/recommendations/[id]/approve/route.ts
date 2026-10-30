import { approveApiSchema } from "@/lib/validation/tips";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { approveRecommendation } from "@/server/recommendations/service";

/** Approves one exact version. `confirmed: true` is required (the same explicit confirmation as the form). */
export async function POST(request: Request, ctx: RouteContext<"/api/recommendations/[id]/approve">) {
  const w = await jsonWrite(request, approveApiSchema, { ownerOnly: true });
  if ("error" in w) return w.error;
  const { id } = await ctx.params;
  try {
    const r = await approveRecommendation(w.access.merchant, actorOf(w.access), { recommendationId: id, version: w.body.version });
    if (!r.ok) return Response.json({ error: r.error }, { status: r.error === "Recommendation not found." ? 404 : 409 });
    return Response.json({ ok: true, status: "APPROVED" });
  } catch (e) {
    console.error("approve api failed:", e);
    return Response.json({ error: "Could not approve." }, { status: 500 });
  }
}
