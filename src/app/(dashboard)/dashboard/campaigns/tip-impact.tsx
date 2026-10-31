import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/dashboard/panel";
import { formatDateTimeIST, formatPaise } from "@/lib/money";
import type { Verdict } from "@/server/tips/impact-math";
import { getTipImpacts, type TipImpact } from "@/server/tips/impact";

const VERDICT: Record<Verdict, { label: string; variant: "success" | "warning" | "neutral" | "danger" }> = {
  up: { label: "Sales up", variant: "success" },
  down: { label: "Sales down", variant: "danger" },
  flat: { label: "No clear change", variant: "neutral" },
  "too-early": { label: "Too early to tell", variant: "warning" },
  "no-baseline": { label: "No earlier sales to compare", variant: "neutral" },
};

const pct = (v: number | null) => (v === null ? "n/a" : `${v > 0 ? "+" : ""}${v}%`);

function Row({ label, before, after, change, note }: { label: string; before: number; after: number; change: number | null; note?: string }) {
  return (
    <tr className="border-t border-[#F0F2F5]">
      <td className="py-1.5 pr-3 text-[#525866]">{label}{note && <span className="block text-[10px] text-[#737B8C]">{note}</span>}</td>
      <td className="px-2 text-right font-mono tabular-nums">{formatPaise(before)}</td>
      <td className="px-2 text-right font-mono tabular-nums">{formatPaise(after)}</td>
      <td className={`pl-2 text-right font-mono font-semibold tabular-nums ${change === null ? "" : change >= 0 ? "text-emerald-700" : "text-red-700"}`}>{pct(change)}</td>
    </tr>
  );
}

function Item({ i }: { i: TipImpact }) {
  const v = VERDICT[(i.audience ?? i.shop).verdict];
  return (
    <li className="space-y-2 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/dashboard/action-centre/${i.recommendationId}`} className="font-semibold text-[#171A23] hover:text-[#4338CA] hover:underline">{i.title}</Link>
        <Badge variant={v.variant} size="sm" withDot>{v.label}</Badge>
      </div>
      <p className="text-[11px] text-[#737B8C]">
        Approved {formatDateTimeIST(i.approvedAt)} &middot; before: {i.before.fromDate} to {i.before.toDate} ({i.before.days} days) &middot; after: {i.after.fromDate} to {i.after.toDate} ({i.after.days} {i.after.days === 1 ? "day" : "days"})
      </p>
      <table className="w-full max-w-xl text-[11px]">
        <thead>
          <tr className="text-left text-[#737B8C]"><th className="font-medium">Per day</th><th className="px-2 text-right font-medium">Before</th><th className="px-2 text-right font-medium">After</th><th className="pl-2 text-right font-medium">Change</th></tr>
        </thead>
        <tbody>
          <Row label="Whole shop sales" before={i.shop.beforePerDayPaise} after={i.shop.afterPerDayPaise} change={i.shop.changePct} />
          <Row label="Shop gross profit" before={i.shop.profitPerDayBefore} after={i.shop.profitPerDayAfter} change={i.shop.profitPerDayBefore > 0 ? Math.round(((i.shop.profitPerDayAfter - i.shop.profitPerDayBefore) / i.shop.profitPerDayBefore) * 1000) / 10 : null} />
          {i.audience && <Row label="Targeted customers" note={`${i.audience.customers} customers in the audience`} before={i.audience.beforePerDayPaise} after={i.audience.afterPerDayPaise} change={i.audience.changePct} />}
        </tbody>
      </table>
      {i.couponSales.orders > 0 && <p className="text-[11px] text-[#525866]">{i.couponSales.orders} sales used this tip's codes: {formatPaise(i.couponSales.netPaise)}.</p>}
    </li>
  );
}

/** Before/after sales for tips the owner approved. A comparison next to the approval date, not proof the tip caused the change. */
export async function TipImpactPanel({ merchantId }: { merchantId: string }) {
  const impacts = await getTipImpacts(merchantId);
  return (
    <Panel title="Did approved tips help?" subtitle="Sales per day in the days after you approved a tip, against the days just before. It shows what happened next to the approval, not that the tip caused it.">
      {impacts.length === 0 ? (
        <p className="text-xs text-[#737B8C]">Nothing to compare yet. Approve a tip in the Action Centre and, from the next day on, its before and after sales show here.</p>
      ) : (
        <ul className="divide-y divide-[#F0F2F5]">{impacts.map((i) => <Item key={i.recommendationId} i={i} />)}</ul>
      )}
    </Panel>
  );
}
