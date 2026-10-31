"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { customerProfileSchema } from "@/lib/validation/customer";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";

export type ProfileFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

/** Edits contact details only. Sales, ledger and consent records are never touched. */
export async function updateCustomerProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) redirect("/onboarding");

  const parsed = customerProfileSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { customerId, displayName, phone, preferredLanguage } = parsed.data;

  try {
    // The merchantId in the filter keeps the write inside the active shop.
    const { count } = await db.customer.updateMany({
      where: { id: customerId, merchantId: membership.merchantId },
      data: { displayName, phone: phone ?? null, preferredLanguage },
    });
    if (count === 0) return { error: "Customer not found." };
  } catch (e) {
    console.error("customer profile update failed:", e);
    return { error: "Could not save the profile. Please try again." };
  }
  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/udhaar", "layout");
  return { success: "Profile updated." };
}
