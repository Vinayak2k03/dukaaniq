import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "@/components/ui/icons";

export function KpiCard({
  label,
  value,
  trend,
  trendLabel,
  hint,
  icon,
  sparklineData,
  children,
}: {
  label: string;
  value: string;
  trend?: number; // percentage, positive or negative
  trendLabel?: string;
  hint?: string;
  icon?: ReactNode;
  sparklineData?: number[];
  children?: ReactNode;
}) {
  const isPositive = trend !== undefined ? trend >= 0 : undefined;

  return (
    <div className="group relative rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:border-[#CBD5E1]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#737B8C]">{label}</p>
        {icon ? <div className="text-[#737B8C] group-hover:text-[#4338CA] transition-colors">{icon}</div> : null}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="font-sans text-[26px] sm:text-[28px] font-semibold tracking-tight text-[#171A23] tabular-nums">
          {value}
        </p>

        {sparklineData && sparklineData.length > 1 ? (
          <Sparkline data={sparklineData} positive={isPositive ?? true} />
        ) : null}
      </div>

      {(trend !== undefined || hint) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-1 border-t border-[#F0F2F5] text-xs">
          {trend !== undefined ? (
            <span
              className={`inline-flex items-center gap-1 font-semibold tabular-nums rounded px-1.5 py-0.5 ${
                isPositive
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {isPositive ? `+${trend.toFixed(1)}%` : `${trend.toFixed(1)}%`}
            </span>
          ) : null}
          {trendLabel ? <span className="text-[#737B8C]">{trendLabel}</span> : null}
          {hint && !trendLabel ? <span className="text-[#737B8C] leading-snug">{hint}</span> : null}
        </div>
      )}

      {children}
    </div>
  );
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 64;
  const height = 24;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const stroke = positive ? "#10B981" : "#EF4444";
  const fill = positive ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)";

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible" aria-hidden="true">
      <polygon points={areaPoints} fill={fill} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
