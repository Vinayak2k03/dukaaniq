import { addDays } from "@/server/analytics/range";
import { formatLocalDate, formatPaise } from "@/lib/money";
import type { Verdict } from "./impact-math";

/**
 * Pure rules for "you approved this before, do you want to reapply it?". A tip is offered again once the period it was
 * active for is over; the message restates how sales moved in the days after the approval (a comparison, not proof).
 */

/** Active period when the offer states no validity; also the longest period the before/after comparison covers. */
export const DEFAULT_ACTIVE_DAYS = 14;
const MIN_ACTIVE_DAYS = 7;

export type PastApproval = {
  recommendationId: string;
  key: string;
  title: string;
  approvedYmd: string;
  /** Length of the offer's validity window, when it had one. */
  validityDays: number | null;
  impact: { changePct: number | null; verdict: Verdict; beforePerDayPaise: number; afterPerDayPaise: number; basis: "targeted customers" | "shop" } | null;
};

export const activeDaysOf = (validityDays: number | null) => Math.min(DEFAULT_ACTIVE_DAYS, Math.max(MIN_ACTIVE_DAYS, validityDays ?? DEFAULT_ACTIVE_DAYS));

/** Last day the tip was active. */
export const activeUntil = (a: Pick<PastApproval, "approvedYmd" | "validityDays">) => addDays(a.approvedYmd, activeDaysOf(a.validityDays));

/**
 * The latest approval of each tip whose active period has ended, newest first. A tip that is open right now, was
 * approved again since, or was rejected recently is not offered.
 */
export function pickReapplyable(approvals: PastApproval[], o: { todayYmd: string; blockedKeys: Iterable<string> }): PastApproval[] {
  const blocked = new Set(o.blockedKeys);
  const latest = new Map<string, PastApproval>();
  for (const a of approvals) {
    const cur = latest.get(a.key);
    if (!cur || a.approvedYmd > cur.approvedYmd) latest.set(a.key, a);
  }
  return [...latest.values()].filter((a) => !blocked.has(a.key) && activeUntil(a) < o.todayYmd).sort((x, y) => y.approvedYmd.localeCompare(x.approvedYmd));
}

const pct = (v: number) => `${Math.abs(v)}%`;

/** One short paragraph for the owner: when it was approved, what happened to sales, and the question. */
export function reapplyMessage(a: PastApproval): string {
  const head = `You approved "${a.title}" on ${formatLocalDate(a.approvedYmd)}; it was active for about ${activeDaysOf(a.validityDays)} days.`;
  const i = a.impact;
  const ask = "Do you want to reapply it?";
  if (!i || i.verdict === "too-early" || i.verdict === "no-baseline" || i.changePct === null) return `${head} There is not enough sales data to say how it went. ${ask}`;
  const days = `${formatPaise(i.beforePerDayPaise)} to ${formatPaise(i.afterPerDayPaise)} a day`;
  const who = i.basis === "shop" ? "Your shop sales" : "Sales from the customers it targeted";
  if (i.verdict === "up") return `${head} ${who} grew ${pct(i.changePct)} afterwards (${days}). ${ask}`;
  if (i.verdict === "down") return `${head} ${who} dipped ${pct(i.changePct)} afterwards (${days}), so reapply only if you think it helped. ${ask}`;
  return `${head} ${who} stayed about the same afterwards (${days}). ${ask}`;
}
