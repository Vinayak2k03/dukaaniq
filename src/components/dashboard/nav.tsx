"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/sales", label: "Sales" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/action-centre", label: "Suggestions" },
  { href: "/dashboard/transactions", label: "Bills" },
  { href: "/dashboard/campaigns", label: "Offers & coupons" },
  { href: "/dashboard/udhaar", label: "Udhaar" },
  { href: "/dashboard/recover-customers", label: "Customers not coming" },
  { href: "/dashboard/import", label: "Import from Excel" },
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
