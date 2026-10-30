"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { markAllNotificationsRead, markNotificationRead } from "./service";

const idSchema = z.string().min(1).max(64);

/** merchantId always comes from the user's verified membership, never from the client. */
async function activeMerchantId() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  return membership?.merchantId ?? null;
}

export async function markNotificationAsReadAction(notificationId: string): Promise<{ ok: boolean }> {
  const parsed = idSchema.safeParse(notificationId);
  if (!parsed.success) return { ok: false };
  const merchantId = await activeMerchantId();
  if (!merchantId) return { ok: false };
  await markNotificationRead(merchantId, parsed.data);
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function markAllNotificationsAsReadAction(): Promise<{ ok: boolean }> {
  const merchantId = await activeMerchantId();
  if (!merchantId) return { ok: false };
  await markAllNotificationsRead(merchantId);
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
