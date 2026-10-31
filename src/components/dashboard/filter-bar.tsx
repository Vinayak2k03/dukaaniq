"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DatePicker } from "@/components/ui/date-picker";
import { RANGE_OPTIONS, type DashboardQuery } from "@/lib/validation/dashboard";
import { Calendar } from "@/components/ui/icons";

const selectClass =
  "rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171A23] shadow-[0_1px_2px_rgba(16,24,40,0.03)] focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20";

type Props = {
  query: DashboardQuery;
  categories: string[];
  /** Latest selectable day (the store's reference date); later days are disabled. */
  referenceDate: string;
  /** The window actually being shown, so the pickers always display what the page is using. */
  fromDate: string;
  toDate: string;
};

export function FilterBar({ query, categories, referenceDate, fromDate, toDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);

  // Every control applies immediately and keeps the user on the current page.
  function go(next: { range: string; from?: string; to?: string; category?: string }) {
    const p = new URLSearchParams();
    p.set("range", next.range);
    if (next.range === "custom" && next.from && next.to) {
      p.set("from", next.from);
      p.set("to", next.to);
    }
    if (next.category) p.set("category", next.category);
    router.push(`${pathname}?${p.toString()}`);
  }

  const category = query.category ?? "";
  const pickDate = (which: "from" | "to") => (value: string) => {
    const nf = which === "from" ? value : from;
    const nt = which === "to" ? value : to;
    // Keep the pair valid: moving one end past the other drags the other along.
    const fixedFrom = nf > nt ? nt : nf;
    const fixedTo = nt < nf ? nf : nt;
    setFrom(fixedFrom);
    setTo(fixedTo);
    go({ range: "custom", from: fixedFrom, to: fixedTo, category });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E2E4E9] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[#737B8C]">
        <Calendar size={15} className="text-[#4338CA]" />
        <span>Period:</span>
      </div>

      <select
        aria-label="Period"
        value={query.range}
        onChange={(e) => go({ range: e.target.value, from, to, category })}
        className={selectClass}
      >
        {RANGE_OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <DatePicker label="Start date" value={from} max={referenceDate} onChange={pickDate("from")} />
        <span className="text-xs text-[#94A3B8]">&rarr;</span>
        <DatePicker label="End date" value={to} max={referenceDate} onChange={pickDate("to")} />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="category" className="text-xs font-medium text-[#737B8C]">
          Category:
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => go({ range: query.range, from, to, category: e.target.value })}
          className={selectClass}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
