import { z } from "zod";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { createReminderForCustomer } from "@/server/recommendations/service";

/**
 * Drafts a payment-reminder proposal for one overdue customer (`id` = customer id). The proposal waits for the
 * owner's approval in Action Centre; nothing is sent from here.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/credit/customers/[id]/reminder">) {
  const w = await jsonWrite(request, z.object({}), { ownerOnly: true });
  if ("error" in w) return w.error;
  const { id } = await ctx.params;
  try {
    const r = await createReminderForCustomer(w.access.merchant, actorOf(w.access), id);
    if (!r.ok) return Response.json({ error: r.error }, { status: 422 });
    return Response.json({ recommendationId: r.id, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201 });
  } catch (e) {
    console.error("reminder api failed:", e);
    return Response.json({ error: "Could not prepare the reminder." }, { status: 500 });
  }
}
