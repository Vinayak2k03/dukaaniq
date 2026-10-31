import type { DashboardQuery } from "@/lib/validation/dashboard";

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
const MAX_CUSTOM_DAYS = 400;

/** The synthetic demo store is pinned to this date so demo numbers stay reproducible (PRD 5.4). */
export const DEMO_REFERENCE_DATE = "2026-10-30";

export type Granularity = "day" | "week" | "month";

export type ResolvedRange = {
  key: DashboardQuery["range"];
  fromDate: string;
  toDate: string;
  startUtc: Date;
  endExclusiveUtc: Date;
  days: number;
  granularity: Granularity;
};

const toMs = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isRealDate = (ymd: string) => toYmd(toMs(ymd)) === ymd;

/** The Asia/Kolkata calendar day (YYYY-MM-DD) of an instant. */
export const istYmd = (d: Date) => toYmd(d.getTime() + IST_OFFSET_MS);

/** A plain inclusive day range with no reference-date limit (for before/after comparisons that run up to today). */
export function rangeBetween(fromDate: string, toDate: string): ResolvedRange {
  const days = daysBetween(fromDate, toDate) + 1;
  return { key: "custom", fromDate, toDate, days, startUtc: new Date(toMs(fromDate) - IST_OFFSET_MS), endExclusiveUtc: new Date(toMs(toDate) + DAY_MS - IST_OFFSET_MS), granularity: "day" };
}

export const addDays = (ymd: string, n: number) => toYmd(toMs(ymd) + n * DAY_MS);

export const referenceDateFor = (merchant: { isDemo: boolean }) =>
  merchant.isDemo ? DEMO_REFERENCE_DATE : toYmd(Date.now() + IST_OFFSET_MS);

/** Local (Asia/Kolkata) calendar day-difference between two YYYY-MM-DD dates. */
export const daysBetween = (fromYmd: string, toYmdStr: string) => Math.round((toMs(toYmdStr) - toMs(fromYmd)) / DAY_MS);

export function resolveRange(query: DashboardQuery, referenceDate: string): { range: ResolvedRange; error?: string } {
  const preset = (key: ResolvedRange["key"], toDate: string, fromDate: string) => build(key, fromDate, toDate);

  function build(key: ResolvedRange["key"], fromDate: string, toDate: string): { range: ResolvedRange } {
    const days = daysBetween(fromDate, toDate) + 1;
    return {
      range: {
        key,
        fromDate,
        toDate,
        days,
        startUtc: new Date(toMs(fromDate) - IST_OFFSET_MS),
        endExclusiveUtc: new Date(toMs(toDate) + DAY_MS - IST_OFFSET_MS),
        granularity: days <= 31 ? "day" : days <= 120 ? "week" : "month",
      },
    };
  }

  const back = (n: number) => toYmd(toMs(referenceDate) - (n - 1) * DAY_MS);
  const fallback = (error: string) => ({ ...preset("30d", referenceDate, back(30)), error });

  switch (query.range) {
    case "7d":
      return preset("7d", referenceDate, back(7));
    case "30d":
      return preset("30d", referenceDate, back(30));
    case "90d":
      return preset("90d", referenceDate, back(90));
    case "6m": {
      const d = new Date(toMs(referenceDate));
      d.setUTCMonth(d.getUTCMonth() - 6);
      return preset("6m", referenceDate, toYmd(d.getTime() + DAY_MS));
    }
    case "custom": {
      const { from, to } = query;
      if (!from || !to) return fallback("Choose both a start and an end date for a custom range.");
      if (!isRealDate(from) || !isRealDate(to)) return fallback("One of the dates is not a real calendar date.");
      if (from > to) return fallback("The start date must be on or before the end date.");
      if (to > referenceDate) return fallback(`The end date cannot be after ${referenceDate}.`);
      if (daysBetween(from, to) + 1 > MAX_CUSTOM_DAYS) return fallback(`A custom range can be at most ${MAX_CUSTOM_DAYS} days.`);
      return build("custom", from, to);
    }
  }
}
