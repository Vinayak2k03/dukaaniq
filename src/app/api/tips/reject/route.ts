import { tipRejectSchema } from "@/lib/validation/tips";
import { jsonWrite } from "@/server/api/json-route";
import { rejectTip } from "@/server/tips/service";

/** POST { sessionId, key, reason, note? }: the owner rejects a tip shown on the tips screen. Nothing is saved as a recommendation. */
export async function POST(request: Request) {
  const w = await jsonWrite(request, tipRejectSchema, { ownerOnly: true });
  if ("error" in w) return w.error;
  try {
    const r = await rejectTip(w.access.merchant, w.body);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json(r);
  } catch (e) {
    console.error("tip reject api failed:", e);
    return Response.json({ error: "Could not save this. Please try again." }, { status: 500 });
  }
}
