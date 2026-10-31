import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/dashboard/panel";
import { getReapplyOffers } from "@/server/tips/reapply";
import { ReapplyButton } from "./reapply-button";

/** Tips the owner approved earlier whose active period is over, with how sales moved, and a button to reapply. Renders nothing when there are none. */
export async function ReapplyPanel({ merchantId }: { merchantId: string }) {
  const offers = await getReapplyOffers(merchantId).catch((e) => {
    console.error("Reapply offers failed:", e);
    return [];
  });
  if (offers.length === 0) return null;
  return (
    <Panel title="Reapply an earlier tip?" subtitle="Tips you approved before that have finished. Reapplying prepares a fresh proposal from today's numbers; you still review and approve it.">
      <ul className="divide-y divide-[#F0F2F5]">
        {offers.map((o) => (
          <li key={o.recommendationId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#171A23]">{o.title}</span>
                {o.verdict === "up" ? <Badge variant="success" size="sm">Sales up</Badge> : o.verdict === "down" ? <Badge variant="danger" size="sm">Sales down</Badge> : null}
              </div>
              <p className="leading-relaxed text-[#525866]">{o.message}</p>
            </div>
            <ReapplyButton recommendationId={o.recommendationId} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
