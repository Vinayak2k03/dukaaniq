import { z } from "zod";
import { getApiMerchantAccess } from "@/server/merchant/access";
import { listRecommendations } from "@/server/recommendations/service";

const TYPES = ["WINBACK", "BUNDLE", "SLOW_MOVING", "PEAK_TIMING", "CREDIT_REMINDER", "LOYALTY", "FESTIVE", "OFF_PEAK"] as const;
const querySchema = z.object({ type: z.enum(TYPES).optional() });

export async function GET(request: Request) {
  const access = await getApiMerchantAccess();
  if ("error" in access) return access.error;
  const parsed = querySchema.safeParse({ type: new URL(request.url).searchParams.get("type") ?? undefined });
  if (!parsed.success) return Response.json({ error: "Unknown recommendation type" }, { status: 400 });
  try {
    return Response.json({ recommendations: await listRecommendations(access.merchant.id, parsed.data.type) });
  } catch (e) {
    console.error("recommendations list failed:", e);
    return Response.json({ error: "Could not load recommendations." }, { status: 500 });
  }
}
