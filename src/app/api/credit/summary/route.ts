import { referenceDateFor } from "@/server/analytics/range";
import { listAccounts, summarize } from "@/server/credit/service";
import { getApiMerchantAccess } from "@/server/merchant/access";

export async function GET() {
  const access = await getApiMerchantAccess();
  if ("error" in access) return access.error;
  try {
    const asOf = referenceDateFor(access.merchant);
    return Response.json({ asOf, isDemo: access.merchant.isDemo, ...summarize(await listAccounts(access.merchant, asOf)) });
  } catch (e) {
    console.error("credit summary failed:", e);
    return Response.json({ error: "Could not load credit summary." }, { status: 500 });
  }
}
