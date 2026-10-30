import { referenceDateFor } from "@/server/analytics/range";
import { getCustomerLedger } from "@/server/credit/service";
import { getApiMerchantAccess } from "@/server/merchant/access";

export async function GET(_request: Request, ctx: RouteContext<"/api/credit/customers/[id]/ledger">) {
  const access = await getApiMerchantAccess();
  if ("error" in access) return access.error;
  const { id } = await ctx.params;
  try {
    const asOf = referenceDateFor(access.merchant);
    const ledger = await getCustomerLedger(access.merchant, id, asOf);
    if (!ledger) return Response.json({ error: "Customer not found" }, { status: 404 });
    return Response.json({ asOf, customer: ledger.customer, account: ledger.account, entries: ledger.lines });
  } catch (e) {
    console.error("credit ledger failed:", e);
    return Response.json({ error: "Could not load ledger." }, { status: 500 });
  }
}
