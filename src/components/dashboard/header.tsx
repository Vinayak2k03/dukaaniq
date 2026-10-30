"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { switchMerchantAction } from "@/server/merchant/actions";
import { ChevronRight, LogOut, Shield } from "@/components/ui/icons";
import type { NotificationItem } from "@/server/notifications/service";
import { NotificationBell } from "./notification-bell";

type Membership = {
  merchantId: string;
  merchant: {
    shopName: string;
    isDemo: boolean;
  };
};

const routeTitles: Record<string, string> = {
  "/dashboard": "Command Centre",
  "/dashboard/sales": "Sales Analytics",
  "/dashboard/customers": "Customer Intelligence",
  "/dashboard/action-centre": "AI Recommendation Centre",
  "/dashboard/grow-profit": "Growth Tips",
  "/dashboard/transactions": "Financial Transactions",
  "/dashboard/campaigns": "Coupons & Campaigns",
  "/dashboard/udhaar": "Udhaar & Credit Ledger",
  "/dashboard/recover-customers": "Customer Recovery",
  "/dashboard/import": "Enterprise Workbook Importer",
  "/dashboard/settings": "Shop & System Settings",
};

export function DashboardHeader({
  sessionUser,
  currentMembership,
  memberships,
  notifications = { items: [], unreadCount: 0 },
}: {
  sessionUser: { name: string; email: string };
  currentMembership: Membership | null;
  memberships: Membership[];
  notifications?: { items: NotificationItem[]; unreadCount: number };
}) {
  const pathname = usePathname();

  // Find longest matching route
  const currentTitle =
    routeTitles[pathname] ??
    Object.entries(routeTitles).find(([route]) => route !== "/dashboard" && pathname.startsWith(route))?.[1] ??
    "Dashboard";

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E4E9] bg-white/95 px-4 sm:px-6 py-3 backdrop-blur-sm">
      {/* Left: Breadcrumbs & Page title */}
      <div className="flex items-center gap-2 text-xs">
        <Link href="/dashboard" className="text-[#737B8C] hover:text-[#171A23] font-medium transition-colors">
          DukaanIQ
        </Link>
        <ChevronRight size={13} className="text-[#94A3B8]" />
        <span className="font-semibold text-[#171A23]">{currentTitle}</span>

        {/* Live sync indicator */}
        <div className="hidden lg:flex items-center gap-1.5 ml-3 pl-3 border-l border-[#E2E4E9] text-[11px] text-[#737B8C]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Neon DB Active</span>
        </div>
      </div>

      {/* Right: Store switcher, User info, Logout */}
      <div className="flex items-center gap-3">
        {memberships.length > 1 ? (
          <form action={switchMerchantAction} className="flex items-center gap-1.5">
            <select
              id="merchantId"
              name="merchantId"
              defaultValue={currentMembership?.merchantId}
              className="rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171A23] shadow-[0_1px_2px_rgba(16,24,40,0.03)] focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
            >
              {memberships.map((m) => (
                <option key={m.merchantId} value={m.merchantId}>
                  {m.merchant.shopName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171A23] hover:bg-[#F8F9FA] transition-colors"
            >
              Switch
            </button>
          </form>
        ) : (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-[#F4F5F7] px-2.5 py-1 text-xs font-medium text-[#525866]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4338CA]" />
            {currentMembership?.merchant.shopName ?? "Active Store"}
          </span>
        )}

        {currentMembership && (
          <NotificationBell key={currentMembership.merchantId} items={notifications.items} unreadCount={notifications.unreadCount} />
        )}

        {/* User Pill & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#E2E4E9]">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4338CA]/10 text-xs font-semibold text-[#4338CA]">
            {sessionUser.name ? sessionUser.name[0]?.toUpperCase() : "U"}
          </div>
          <span className="hidden xl:inline text-xs font-medium text-[#171A23]">
            {sessionUser.email}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              title="Sign out"
              className="flex items-center gap-1 rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#525866] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors cursor-pointer"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

