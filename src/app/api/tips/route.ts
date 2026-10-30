import { tipsRequestSchema } from "@/lib/validation/tips";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { getTips } from "@/server/tips/service";

/**
 * POST { sessionId?, count?: 1..5, focus?: TipFamily[], feedback?: { recommendationId?, reason?, note? } }
 * Without a sessionId it starts a session; with one it returns the next batch. Each batch becomes
 * PENDING_APPROVAL recommendations in the Action Centre; nothing reaches a customer without approval.
 */
export async function POST(request: Request) {
  const w = await jsonWrite(request, tipsRequestSchema, { ownerOnly: true });
  if ("error" in w) return w.error;
  try {
    const r = await getTips(w.access.merchant, actorOf(w.access), w.body);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json(r);
  } catch (e) {
    console.error("tips api failed:", e);
    return Response.json({ error: "Could not prepare tips. Please try again." }, { status: 500 });
  }
}
