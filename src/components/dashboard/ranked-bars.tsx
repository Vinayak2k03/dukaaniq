export type RankedItem = { key: string; label: string; value: number; display: string };

export function RankedBars({ items, color }: { items: RankedItem[]; color: string }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <ol className="space-y-2">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{i.label}</span>
            <span className="shrink-0 font-medium text-slate-900">{i.display}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden="true">
            <div className={`h-2 rounded-full ${color}`} style={{ width: max === 0 ? "0%" : `${Math.max((i.value / max) * 100, 0)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
