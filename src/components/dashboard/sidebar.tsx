"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Sparkles,
  Receipt,
  Tag,
  BookMarked,
  UserCheck,
  UploadCloud,
  Settings,
  Store,
  ChevronDown,
  X,
  Menu,
} from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navigationGroups: NavGroup[] = [
  {
    title: "OVERVIEW",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "BUSINESS INTELLIGENCE",
    items: [
      { href: "/dashboard/sales", label: "Sales Analytics", icon: TrendingUp },
      { href: "/dashboard/customers", label: "Customers", icon: Users },
      { href: "/dashboard/action-centre", label: "AI Recommendations", icon: Sparkles },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      { href: "/dashboard/transactions", label: "Transactions", icon: Receipt },
      { href: "/dashboard/campaigns", label: "Coupons & Campaigns", icon: Tag },
      { href: "/dashboard/udhaar", label: "Udhaar Ledger", icon: BookMarked },
      { href: "/dashboard/recover-customers", label: "Recover Inactive", icon: UserCheck },
    ],
  },
  {
    title: "DATA & SYSTEM",
    items: [
      { href: "/dashboard/import", label: "Workbook Importer", icon: UploadCloud },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar({
  merchantName,
  merchantCategory,
  userEmail,
  isOwner,
}: {
  merchantName?: string;
  merchantCategory?: string;
  userEmail?: string;
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white select-none">
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-6 px-1">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4338CA] text-white shadow-[0_2px_4px_rgba(67,56,202,0.3)] transition-transform group-hover:scale-105">
              <Sparkles size={17} />
            </div>
            <div>
              <span className="font-sans text-base font-bold tracking-tight text-[#171A23]">
                Dukaan<span className="text-[#4338CA]">IQ</span>
              </span>
              <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 tracking-normal border border-indigo-200/50">
                AI Copilot
              </span>
            </div>
          </Link>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-slate-500 hover:text-slate-800 p-1"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Grouped Navigation */}
        <nav aria-label="Main navigation" className="space-y-6">
          {navigationGroups.map((group) => (
            <div key={group.title}>
              <p className="px-2.5 pb-2 text-[10px] font-bold tracking-wider text-[#737B8C] uppercase">
                {group.title}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        aria-current={isActive ? "page" : undefined}
                        className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-150 ${
                          isActive
                            ? "bg-[#4338CA]/10 text-[#4338CA] font-semibold"
                            : "text-[#525866] hover:bg-[#F4F5F7] hover:text-[#171A23]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon
                            size={16}
                            className={`transition-colors ${
                              isActive
                                ? "text-[#4338CA]"
                                : "text-[#737B8C] group-hover:text-[#171A23]"
                            }`}
                          />
                          <span>{item.label}</span>
                        </div>
                        {item.badge ? (
                          <Badge variant="brand" size="sm">
                            {item.badge}
                          </Badge>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Merchant Profile Footer */}
      <div className="border-t border-[#F0F2F5] p-3.5 bg-[#FAFBFD]">
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#4338CA] border border-slate-200">
            <Store size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#171A23]">
              {merchantName ?? "My Dukaan"}
            </p>
            <p className="truncate text-[11px] text-[#737B8C]">
              {merchantCategory ?? "Retail Store"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Bar trigger */}
      <div className="flex md:hidden items-center justify-between border-b border-[#E2E4E9] bg-white px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4338CA] text-white">
            <Sparkles size={15} />
          </div>
          <span className="font-bold text-sm text-[#171A23]">
            Dukaan<span className="text-[#4338CA]">IQ</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl z-10">
            {navContent}
          </div>
        </div>
      )}

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30 border-r border-[#E2E4E9]">
        {navContent}
      </aside>
    </>
  );
}

