import { formatPaise } from "@/lib/money";

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Offer terms as plain lines (coupon code, combo, time window, festival, validity), from offerTerms.summary. */
export function OfferSummary({ terms }: { terms: unknown }) {
  const lines = rec(terms).summary;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-xs text-[#171A23]">
      {lines.map((l) => (
        <li key={String(l)} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4338CA]" />{String(l)}</li>
      ))}
    </ul>
  );
}

type Scenario = { redemptionPct: number; redemptions: number; incrementalSalesPaise: number; productCostPaise: number; discountExposurePaise: number; grossProfitImpactPaise: number };

/** Scenario range table (PRD 6.3): each assumed redemption rate with its sales, cost, discount and gross-profit impact. */
export function EconomicsRange({ economics }: { economics: unknown }) {
  const e = rec(economics);
  const scenarios = Array.isArray(e.scenarios) ? (e.scenarios as Scenario[]) : null;
  const assumptions = Array.isArray(e.assumptions) ? (e.assumptions as string[]) : [];
  if (!scenarios && typeof e.maxExposurePaise !== "number") return null;
  return (
    <div className="space-y-3 text-xs">
      <p className="font-semibold text-[#171A23]">{String(e.label ?? "Scenario estimate")}</p>
      {scenarios ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[11px] uppercase tracking-wide text-[#737B8C]">
              <tr><th className="pb-1.5 pr-3">Redemption</th><th className="pb-1.5 pr-3 text-right">Extra sales</th><th className="pb-1.5 pr-3 text-right">Discount</th><th className="pb-1.5 text-right">Gross profit</th></tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5] tabular-nums">
              {scenarios.map((s) => (
                <tr key={s.redemptionPct}>
                  <td className="py-1.5 pr-3">{s.redemptionPct}% ({s.redemptions})</td>
                  <td className="py-1.5 pr-3 text-right">{formatPaise(s.incrementalSalesPaise)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatPaise(s.discountExposurePaise)}</td>
                  <td className={`py-1.5 text-right font-semibold ${s.grossProfitImpactPaise < 0 ? "text-rose-700" : "text-emerald-800"}`}>{formatPaise(s.grossProfitImpactPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {typeof e.maxDiscountExposurePaise === "number" && <p className="mt-2 text-[#525866]">Maximum discount if every customer redeems: {formatPaise(e.maxDiscountExposurePaise)}</p>}
        </div>
      ) : (
        <p>Maximum exposure: <span className="font-semibold text-rose-800">{formatPaise(e.maxExposurePaise as number)}</span></p>
      )}
      {assumptions.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-[#737B8C]">{assumptions.map((a) => <li key={a}>{a}</li>)}</ul>}
    </div>
  );
}
