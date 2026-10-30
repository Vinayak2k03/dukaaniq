import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/panel";
import { env } from "@/lib/env";
import { referenceDateFor } from "@/server/analytics/range";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { TipsWorkspace } from "./tips-workspace";

export const metadata: Metadata = { title: "Grow Profit" };

export default async function GrowProfitPage() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to get growth tips." />;
  const merchant = membership.merchant;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#E2E4E9] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">Growth Tips</h1>
          <p className="mt-1 text-xs text-[#737B8C]">
            Ideas to reward loyal customers, catch festival demand and fill quiet hours, worked out from {merchant.shopName}&apos;s own data.
          </p>
        </div>
        <Link href="/dashboard/action-centre" className="rounded-lg border border-[#D0D5DD] bg-white px-3.5 py-2 text-xs font-medium text-[#171A23] hover:bg-[#F8F9FA]">
          Open Action Centre
        </Link>
      </div>
      <TipsWorkspace sarvam={Boolean(env.SARVAM_API_KEY)} isOwner={membership.role === "OWNER"} referenceDate={referenceDateFor(merchant)} isDemo={merchant.isDemo} />
    </div>
  );
}
