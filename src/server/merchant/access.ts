import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { MemberRole } from "@/generated/prisma/enums";
import { requireSession } from "@/server/auth/session";

export async function getCurrentMembership(userId: string) {
  return db.merchantMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { merchant: true },
  });
}

/**
 * Authorization gate for ALL merchant-scoped data access.
 * Verifies the signed-in user is a member of `merchantId` (and has an allowed
 * role). Never trust a merchantId from the client without calling this.
 */
export async function requireMerchantAccess(
  merchantId: string,
  allowedRoles?: MemberRole[],
) {
  const session = await requireSession();
  const membership = await db.merchantMember.findUnique({
    where: { merchantId_userId: { merchantId, userId: session.user.id } },
    include: { merchant: true },
  });
  if (!membership || (allowedRoles && !allowedRoles.includes(membership.role))) {
    notFound();
  }
  return { session, membership, merchant: membership.merchant };
}
