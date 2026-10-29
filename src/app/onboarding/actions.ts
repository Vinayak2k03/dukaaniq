"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createMerchantSchema } from "@/lib/validation/merchant";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";

export type OnboardingState = { fieldErrors?: Record<string, string[] | undefined> };

export async function createMerchantAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await requireSession();
  if (await getCurrentMembership(session.user.id)) redirect("/dashboard");

  const parsed = createMerchantSchema.safeParse({
    shopName: formData.get("shopName"),
    businessCategory: formData.get("businessCategory"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  // userId always comes from the verified session, never from the form.
  await db.merchant.create({
    data: {
      ...parsed.data,
      members: { create: { userId: session.user.id, role: "OWNER" } },
    },
  });
  redirect("/dashboard");
}
