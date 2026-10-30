import { z } from "zod";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { executeSimulated } from "@/server/recommendations/service";

/**
 * Runs an APPROVED recommendation (`id` = recommendation id). Execution is simulated: OutboundMessage rows are
 * recorded with simulated = true and nothing leaves the system. Idempotent per approved version.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/actions/[id]/execute">) {
  const w = await jsonWrite(request, z.object({}), { ownerOnly: true });
  if ("error" in w) return w.error;
  const { id } = await ctx.params;
  try {
    const r = await executeSimulated(w.access.merchant, actorOf(w.access), id);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.error === "Recommendation not found." ? 404 : 409 });
    return Response.json({ ok: true, simulated: true, messages: r.messages, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201 });
  } catch (e) {
    console.error("execute api failed:", e);
    return Response.json({ error: "Could not run this action." }, { status: 500 });
  }
}
