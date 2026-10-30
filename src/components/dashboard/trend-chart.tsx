"use client";

import { useState } from "react";

export type ChartPoint = { label: string; value: number; display: string };

export function TrendChart({
  title,
  points,
  color = "indigo",
}: {
  title: string;
  points: ChartPoint[];
  color?: "indigo" | "emerald" | "sky" | "amber";
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!points || points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-slate-400">
        No trend data available for this range
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const safeMax = max === 0 ? 1 : max;
  const first = points[0];
  const last = points[points.length - 1];
  const activePoint = hoveredIndex !== null ? points[hoveredIndex] : points[points.length - 1];

  const colorMap = {
    indigo: {
      bar: "bg-[#4338CA] hover:bg-[#3730A3]",
      activeBar: "bg-[#312E81]",
      line: "#4338CA",
      fill: "rgba(67, 56, 202, 0.08)",
      glow: "text-[#4338CA]",
    },
    emerald: {
      bar: "bg-[#059669] hover:bg-[#047857]",
      activeBar: "bg-[#065F46]",
      line: "#059669",
      fill: "rgba(5, 150, 105, 0.08)",
      glow: "text-[#059669]",
    },
    sky: {
      bar: "bg-[#0284C7] hover:bg-[#0369A1]",
      activeBar: "bg-[#075985]",
      line: "#0284C7",
      fill: "rgba(2, 132, 199, 0.08)",
      glow: "text-[#0284C7]",
    },
    amber: {
      bar: "bg-[#D97706] hover:bg-[#B45309]",
      activeBar: "bg-[#92400E]",
      line: "#D97706",
      fill: "rgba(217, 119, 6, 0.08)",
      glow: "text-[#D97706]",
    },
  };

  const scheme = colorMap[color] ?? colorMap.indigo;

  // Format short date for X-axis (e.g. "2026-10-15" -> "15 Oct")
  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <figure className="relative select-none">
      {/* Live hover indicator header */}
      <div className="mb-3 flex items-baseline justify-between border-b border-[#F0F2F5] pb-2 text-xs">
        <span className="text-[#737B8C]">
          {activePoint ? formatDate(activePoint.label) : "Selected period"}
        </span>
        <span className={`font-mono font-semibold text-sm ${scheme.glow} tabular-nums`}>
          {activePoint ? activePoint.display : "-"}
        </span>
      </div>

      {/* Grid lines */}
      <div className="relative h-44 w-full">
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" aria-hidden="true">
          <div className="border-b border-dashed border-[#F0F2F5] w-full" />
          <div className="border-b border-dashed border-[#F0F2F5] w-full" />
          <div className="border-b border-dashed border-[#F0F2F5] w-full" />
          <div className="border-b border-[#E2E4E9] w-full" />
        </div>

        {/* Bars with smooth transitions and hover detection */}
        <div className="absolute inset-0 flex items-end gap-1 sm:gap-1.5 px-1" aria-hidden="true">
          {points.map((p, idx) => {
            const heightPct = max === 0 ? 0 : Math.max((p.value / safeMax) * 100, 2);
            const isHovered = hoveredIndex === idx;

            return (
              <div
                key={p.label}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="group relative flex h-full flex-1 items-end cursor-pointer py-1"
              >
                <div
                  className={`w-full rounded-t-sm transition-all duration-150 ${
                    isHovered ? scheme.activeBar : scheme.bar
                  }`}
                  style={{ height: `${heightPct}%` }}
                />

                {/* Micro tooltip on mobile / focused */}
                {isHovered && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded bg-[#171A23] px-2 py-1 text-[11px] font-medium text-white shadow-md pointer-events-none">
                    <span className="font-mono tabular-nums">{p.display}</span>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-[#171A23]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Axis dates */}
      {first && last ? (
        <figcaption className="mt-2.5 flex justify-between text-[11px] font-medium text-[#737B8C]">
          <span>{formatDate(first.label)}</span>
          <span className="text-[#94A3B8]">
            {points.length > 2 ? `${points.length} intervals` : ""}
          </span>
          <span>{formatDate(last.label)}</span>
        </figcaption>
      ) : null}

      {/* Screen-reader accessible table */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
