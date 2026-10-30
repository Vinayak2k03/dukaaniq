import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { MemberRole } from "@/generated/prisma/enums";
import { getSession, requireSession } from "@/server/auth/session";

export const ACTIVE_MERCHANT_COOKIE = "dukaaniq_merchant";

export async function listMemberships(userId: string) {
  return db.merchantMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { merchant: true },
  });
}

/**
 * The user's active shop: the one chosen in the shop switcher, if they are
 * still a member of it, otherwise their oldest membership. The cookie is only
 * a preference; membership is always re-checked against the database.
 */
export async function getCurrentMembership(userId: string) {
  const memberships = await listMemberships(userId);
  const preferred = (await cookies()).get(ACTIVE_MERCHANT_COOKIE)?.value;
  return memberships.find((m) => m.merchantId === preferred) ?? memberships[0] ?? null;
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

/**
 * Route Handler variant of the access check. Route Handlers must return HTTP
 * status codes instead of redirecting. merchantId always comes from the user's
 * verified membership, never from the request.
 */
export async function getApiMerchantAccess() {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) } as const;
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return { error: Response.json({ error: "No shop set up for this account" }, { status: 403 }) } as const;
  return { merchant: membership.merchant, session, role: membership.role } as const;
}
