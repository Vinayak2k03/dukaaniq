import { formatLocalDate, formatPaise } from "@/lib/money";

const LABEL_FIX: Record<string, string> = {
  asOf: "As of",
  aov: "Average order value",
  categoryRevenue90: "Category revenue (90d)",
  audienceSpend90Paise: "Audience spend (90d)",
  shareOfSales90Pct: "Share of sales (90d)",
  averageOrders90: "Average orders (90d)",
};

const words = (key: string) =>
  LABEL_FIX[key] ??
  key
    .replace(/(Paise|Pct)$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d+)/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

function format(key: string, v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return key.endsWith("Paise") ? formatPaise(v) : key.endsWith("Pct") ? `${v}%` : String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return formatLocalDate(v);
    const rangeMatch = /^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/.exec(v);
    if (rangeMatch) return `${formatLocalDate(rangeMatch[1])} to ${formatLocalDate(rangeMatch[2])}`;
    return v;
  }
  return JSON.stringify(v);
}

function formatObjectItem(item: Record<string, unknown>): string | null {
  if (typeof item.festival === "string" && typeof item.startDate === "string" && typeof item.endDate === "string") {
    const dates = `${formatLocalDate(item.startDate)} – ${formatLocalDate(item.endDate)}`;
    const avg = typeof item.avgDailySalesPaise === "number" ? `${formatPaise(item.avgDailySalesPaise)}/day` : null;
    const uplift = typeof item.upliftPct === "number" ? `${item.upliftPct >= 0 ? "+" : ""}${item.upliftPct}% uplift` : null;
    const details = [avg, uplift].filter(Boolean).join(", ");
    return `${item.festival} (${dates})${details ? ` — ${details}` : ""}`;
  }
  if (typeof item.name === "string" && typeof item.pricePaise === "number") {
    return `${item.name} (${formatPaise(item.pricePaise)})`;
  }
  if (typeof item.name === "string" && typeof item.limitPaise === "number") {
    return `${item.name} — limit ${formatPaise(item.limitPaise)}`;
  }
  return null;
}

type Props = { data: unknown; hide?: string[] };

/** Renders any structured recommendation facts (evidence, terms, economics) so new recommendation types need no UI work. */
export function JsonFacts({ data, hide = [] }: Props) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const entries = Object.entries(data as Record<string, unknown>).filter(([k]) => !hide.includes(k));
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="shrink-0 text-slate-600">{words(k)}</dt>
          <dd className="min-w-0 break-words font-medium text-slate-900 sm:max-w-[65%] sm:text-right">
            {Array.isArray(v) ? (
              v.length ? (
                <ul className="list-disc space-y-1 pl-4 text-left font-normal">
                  {v.map((x, i) => {
                    if (x && typeof x === "object" && !Array.isArray(x)) {
                      const summary = formatObjectItem(x as Record<string, unknown>);
                      return (
                        <li key={i}>
                          {summary ?? (
                            <div className="rounded-lg bg-slate-50 px-3 py-1 text-left">
                              <JsonFacts data={x} />
                            </div>
                          )}
                        </li>
                      );
                    }
                    return <li key={i}>{format(k, x)}</li>;
                  })}
                </ul>
              ) : (
                "None"
              )
            ) : v && typeof v === "object" ? (
              <div className="rounded-lg bg-slate-50 px-3 py-1 text-left">
                <JsonFacts data={v} />
              </div>
            ) : (
              format(k, v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
