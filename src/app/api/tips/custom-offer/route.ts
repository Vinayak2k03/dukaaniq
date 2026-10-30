import { customOfferSchema } from "@/lib/validation/tips";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { createCustomOffer } from "@/server/tips/service";

/**
 * POST { discountPct: 1..50, audience: LOYAL | INACTIVE | COOLING | ACTIVE | ALL, days?: 1..30 }
 * Prepares ONE offer as a PENDING_APPROVAL proposal. It is only created after the owner taps the confirm button;
 * nothing reaches a customer and no coupon code exists until the offer is approved in the Action Centre.
 */
export async function POST(request: Request) {
  const w = await jsonWrite(request, customOfferSchema, { ownerOnly: true });
  if ("error" in w) return w.error;
  try {
    const r = await createCustomOffer(w.access.merchant, actorOf(w.access), w.body);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ recommendationId: r.recommendationId, title: r.title, audienceSize: r.audienceSize, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201 });
  } catch (e) {
    console.error("custom offer api failed:", e);
    return Response.json({ error: "Could not prepare the offer. Please try again." }, { status: 500 });
  }
}
