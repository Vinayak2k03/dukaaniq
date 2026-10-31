import { productSchema } from "@/lib/validation/records";
import { jsonWrite } from "@/server/api/json-route";
import { getApiMerchantAccess } from "@/server/merchant/access";
import { createProduct, listCatalog } from "@/server/records/service";

/** GET → the shop's products with price and cost, for the sale review card. */
export async function GET() {
  const access = await getApiMerchantAccess();
  if ("error" in access) return access.error;
  return Response.json({ products: await listCatalog(access.merchant.id) });
}

/** POST { name, category?, sellingPrice, costPrice, idempotencyKey } → { productId }. */
export async function POST(request: Request) {
  const w = await jsonWrite(request, productSchema);
  if ("error" in w) return w.error;
  try {
    const r = await createProduct(w.access.merchant, w.body);
    if (!r.ok) return Response.json({ error: r.error, field: r.field ?? null, existingId: r.existingId ?? null }, { status: 409 });
    return Response.json({ productId: r.id, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201 });
  } catch (e) {
    console.error("create product failed:", e);
    return Response.json({ error: "Could not save the product." }, { status: 500 });
  }
}
