import { creditEntrySchema } from "@/lib/validation/credit";
import { createCreditEntry } from "@/server/credit/service";
import { getApiMerchantAccess } from "@/server/merchant/access";

export async function POST(request: Request) {
  const access = await getApiMerchantAccess();
  if ("error" in access) return access.error;

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Send JSON" }, { status: 415 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = creditEntrySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const result = await createCreditEntry(access.merchant, { userId: access.session.user.id }, parsed.data);
    if (!result.ok) return Response.json({ error: result.error, field: result.field ?? null }, { status: result.error === "Customer not found." ? 404 : 422 });
    return Response.json({ entryId: result.entryId, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    console.error("credit entry api failed:", e);
    return Response.json({ error: "Could not save this entry." }, { status: 500 });
  }
}
