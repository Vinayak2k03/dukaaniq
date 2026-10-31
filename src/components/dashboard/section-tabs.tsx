"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pages grouped under one menu entry. Shown as tabs so related screens feel like one place. */
const SECTIONS = [
  [
    { href: "/dashboard/action-centre", label: "Waiting for you" },
    { href: "/dashboard/grow-profit", label: "New ideas" },
    { href: "/dashboard/recover-customers", label: "Customers not coming" },
  ],
  [
    { href: "/dashboard/sales", label: "Overview" },
    { href: "/dashboard/transactions", label: "Bills" },
    { href: "/dashboard/campaigns", label: "Offers & coupons" },
  ],
];

export function SectionTabs() {
  const pathname = usePathname();
  const tabs = SECTIONS.find((group) => group.some((t) => pathname === t.href));
  // Only on a section's main pages, not on a detail page such as one suggestion.
  if (!tabs) return null;
  return (
    <nav aria-label="Section" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-[#E2E4E9] px-1">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${active ? "border-[#4338CA] text-[#4338CA]" : "border-transparent text-[#525866] hover:text-[#171A23]"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
