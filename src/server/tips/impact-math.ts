import { addDays, daysBetween } from "@/server/analytics/range";

/** Pure before/after comparison for an approved tip. The approval day itself is excluded from both sides (it is a partial day). */

export const MAX_AFTER_DAYS = 14;
const MIN_BEFORE_DAYS = 7;
const MAX_BEFORE_DAYS = 28;
/** Fewer after-days than this is too little to call a direction. */
export const MIN_DAYS_FOR_VERDICT = 3;
/** Changes smaller than this (per-day sales) count as flat: ordinary day-to-day noise. */
export const FLAT_BAND_PCT = 5;

export type DayWindow = { fromDate: string; toDate: string; days: number };
export type Totals = { salesPaise: number; orders: number; profitPaise: number | null };
export type Compare = { beforePerDayPaise: number; afterPerDayPaise: number; changePct: number | null; ordersPerDayBefore: number; ordersPerDayAfter: number };
export type Verdict = "too-early" | "up" | "flat" | "down" | "no-baseline";

/** After = the days following approval up to `today` (at most 14). Before = the same weekdays-worth of days just before approval (7 to 28). */
export function impactWindows(approvedYmd: string, todayYmd: string): { before: DayWindow; after: DayWindow } | null {
  const afterFrom = addDays(approvedYmd, 1);
  const afterTo = [addDays(approvedYmd, MAX_AFTER_DAYS), todayYmd].sort()[0];
  const afterDays = daysBetween(afterFrom, afterTo) + 1;
  if (afterDays < 1) return null;
  const beforeDays = Math.min(MAX_BEFORE_DAYS, Math.max(MIN_BEFORE_DAYS, Math.ceil(afterDays / 7) * 7));
  return {
    before: { fromDate: addDays(approvedYmd, -beforeDays), toDate: addDays(approvedYmd, -1), days: beforeDays },
    after: { fromDate: afterFrom, toDate: afterTo, days: afterDays },
  };
}

const perDay = (v: number, days: number) => (days > 0 ? Math.round(v / days) : 0);

export function compareWindows(before: Totals, beforeDays: number, after: Totals, afterDays: number): Compare {
  const b = perDay(before.salesPaise, beforeDays);
  const a = perDay(after.salesPaise, afterDays);
  return {
    beforePerDayPaise: b,
    afterPerDayPaise: a,
    changePct: b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null,
    ordersPerDayBefore: beforeDays > 0 ? Math.round((before.orders / beforeDays) * 10) / 10 : 0,
    ordersPerDayAfter: afterDays > 0 ? Math.round((after.orders / afterDays) * 10) / 10 : 0,
  };
}

export function verdictOf(c: Compare, afterDays: number): Verdict {
  if (afterDays < MIN_DAYS_FOR_VERDICT) return "too-early";
  if (c.changePct === null) return "no-baseline";
  return c.changePct >= FLAT_BAND_PCT ? "up" : c.changePct <= -FLAT_BAND_PCT ? "down" : "flat";
}
