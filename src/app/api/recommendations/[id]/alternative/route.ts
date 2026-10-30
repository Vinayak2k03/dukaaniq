import { z } from "zod";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { createAlternative } from "@/server/recommendations/service";

/** Creates a revised proposal for a rejected recommendation. It is a new recommendation that needs its own approval. */
export async function POST(request: Request, ctx: RouteContext<"/api/recommendations/[id]/alternative">) {
  const w = await jsonWrite(request, z.object({}), { ownerOnly: true });
  if ("error" in w) return w.error;
  const { id } = await ctx.params;
  try {
    const r = await createAlternative(w.access.merchant, actorOf(w.access), id);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.error === "Recommendation not found." ? 404 : 422 });
    return Response.json({ id: r.id, status: "PENDING_APPROVAL" }, { status: 201 });
  } catch (e) {
    console.error("alternative api failed:", e);
    return Response.json({ error: "Could not create an alternative." }, { status: 500 });
  }
}
