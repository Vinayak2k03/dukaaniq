export type RankedItem = { key: string; label: string; value: number; display: string };

export function RankedBars({
  items,
  color = "indigo",
}: {
  items: RankedItem[];
  color?: "indigo" | "emerald" | "sky" | "amber";
}) {
  const max = Math.max(...items.map((i) => i.value), 0);
  const safeMax = max === 0 ? 1 : max;

  const barColors = {
    indigo: "bg-[#4338CA]",
    emerald: "bg-[#059669]",
    sky: "bg-[#0284C7]",
    amber: "bg-[#D97706]",
  };

  const selectedColor = barColors[color] ?? barColors.indigo;

  return (
    <ol className="space-y-3">
      {items.map((i, idx) => {
        const pct = Math.max((i.value / safeMax) * 100, 0);
        return (
          <li key={i.key} className="group">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-[#737B8C] bg-[#F4F5F7]">
                  {idx + 1}
                </span>
                <span className="truncate font-medium text-[#171A23] group-hover:text-[#4338CA] transition-colors">
                  {i.label}
                </span>
              </div>
              <span className="shrink-0 font-mono font-medium text-[#171A23] tabular-nums">
                {i.display}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#F4F5F7] overflow-hidden" aria-hidden="true">
              <div
                className={`h-full rounded-full transition-all duration-300 ${selectedColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
