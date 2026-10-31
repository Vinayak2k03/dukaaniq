import { saleSchema } from "@/lib/validation/records";
import { actorOf, jsonWrite } from "@/server/api/json-route";
import { recordSale } from "@/server/records/service";

/** POST { items[{ productId, quantity, unitPrice }], customerId?, payment, discount?, dueDate?, idempotencyKey } → { saleId, netPaise }. */
export async function POST(request: Request) {
  const w = await jsonWrite(request, saleSchema);
  if ("error" in w) return w.error;
  try {
    const r = await recordSale(w.access.merchant, actorOf(w.access), w.body);
    if (!r.ok) return Response.json({ error: r.error, field: r.field ?? null }, { status: 422 });
    return Response.json({ saleId: r.id, netPaise: r.netPaise, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201 });
  } catch (e) {
    console.error("record sale failed:", e);
    return Response.json({ error: "Could not save the sale." }, { status: 500 });
  }
}
