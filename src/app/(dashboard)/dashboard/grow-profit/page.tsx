import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { TrendingUp, ArrowRight, Sparkles } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Grow Profit" };

export default async function GrowProfitPage() {
  await requireSession();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between border-b border-[#E2E4E9] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">Profit Optimization Intelligence</h1>
          <p className="mt-1 text-xs text-[#737B8C]">
            Spot high-margin products, identify bundle cross-sells and optimize retail profitability.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/50 p-6 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4338CA] text-white">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#171A23]">AI Profit Recommendations &amp; Margin Analysis</h2>
            <p className="mt-1 text-xs text-[#525866] leading-relaxed">
              DukaanIQ calculates true product gross margins by comparing item-level selling prices against wholesale cost prices across all 970 recorded transactions.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard/sales"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#3730A3] transition-colors"
              >
                <span>Open Sales &amp; Margin Matrix</span>
                <ArrowRight size={14} />
              </Link>
              <Link
                href="/dashboard/action-centre"
                className="rounded-lg border border-[#D0D5DD] bg-white px-3.5 py-2 text-xs font-medium text-[#171A23] hover:bg-[#F8F9FA] transition-colors"
              >
                Action Centre Proposals
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
