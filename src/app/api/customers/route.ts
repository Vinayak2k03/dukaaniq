import { customerSchema } from "@/lib/validation/records";
import { jsonWrite } from "@/server/api/json-route";
import { getApiMerchantAccess } from "@/server/merchant/access";
import { createCustomer, listPeople } from "@/server/records/service";

/** GET → the shop's customers (id, name, phone), for choosing who bought on the sale review card. */
export async function GET() {
  const access = await getApiMerchantAccess();
  if ("error" in access) return access.error;
  return Response.json({ customers: await listPeople(access.merchant.id) });
}

/** POST { name, phone?, preferredLanguage?, consent?, idempotencyKey } → { customerId }. */
export async function POST(request: Request) {
  const w = await jsonWrite(request, customerSchema);
  if ("error" in w) return w.error;
  try {
    const r = await createCustomer(w.access.merchant, w.body);
    if (!r.ok) return Response.json({ error: r.error, field: r.field ?? null, existingId: r.existingId ?? null }, { status: 409 });
    return Response.json({ customerId: r.id }, { status: 201 });
  } catch (e) {
    console.error("create customer failed:", e);
    return Response.json({ error: "Could not save the customer." }, { status: 500 });
  }
}
