"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { ACTIVE_MERCHANT_COOKIE, listMemberships } from "@/server/merchant/access";

const schema = z.object({ merchantId: z.string().min(1).max(64) });

export async function switchMerchantAction(formData: FormData) {
  const session = await requireSession();
  const parsed = schema.safeParse({ merchantId: formData.get("merchantId") });
  if (parsed.success) {
    const memberships = await listMemberships(session.user.id);
    if (memberships.some((m) => m.merchantId === parsed.data.merchantId)) {
      (await cookies()).set(ACTIVE_MERCHANT_COOKIE, parsed.data.merchantId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }
  redirect("/dashboard");
}
