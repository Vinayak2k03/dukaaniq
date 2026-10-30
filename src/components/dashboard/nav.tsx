"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/sales", label: "Sales Analytics" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/action-centre", label: "AI Recommendations" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/campaigns", label: "Coupons & Campaigns" },
  { href: "/dashboard/udhaar", label: "Udhaar" },
  { href: "/dashboard/recover-customers", label: "Recover Customers" },
  { href: "/dashboard/import", label: "Workbook Importer" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto py-1">
      {links.map(({ href, label }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-[#4338CA]/10 text-[#4338CA] font-semibold"
                : "text-[#525866] hover:bg-[#F4F5F7] hover:text-[#171A23]"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
