import { formatLocalDate, formatPaise } from "@/lib/money";

const LABEL_FIX: Record<string, string> = { asOf: "As of", aov: "Average order value" };

const words = (key: string) =>
  LABEL_FIX[key] ?? key.replace(/(Paise|Pct)$/, "").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

function format(key: string, v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return key.endsWith("Paise") ? formatPaise(v) : key.endsWith("Pct") ? `${v}%` : String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatLocalDate(v) : v;
  return JSON.stringify(v);
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
          <dt className="text-slate-600">{words(k)}</dt>
          <dd className="font-medium text-slate-900 sm:max-w-[65%] sm:text-right">
            {Array.isArray(v) ? (
              v.length ? (
                <ul className="list-disc pl-4 text-left font-normal">{v.map((x, i) => <li key={i}>{typeof x === "string" ? x : JSON.stringify(x)}</li>)}</ul>
              ) : "None"
            ) : v && typeof v === "object" ? (
              <div className="rounded-lg bg-slate-50 px-3 py-1 text-left"><JsonFacts data={v} /></div>
            ) : format(k, v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
