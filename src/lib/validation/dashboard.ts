import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const dateStr = z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").optional());

export const RANGE_OPTIONS = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
  ["6m", "Last 6 months"],
  ["custom", "Custom range"],
] as const;

export const dashboardQuerySchema = z.object({
  range: z.preprocess(emptyToUndefined, z.enum(["7d", "30d", "90d", "6m", "custom"]).default("30d")),
  from: dateStr,
  to: dateStr,
  category: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

/** Parses untrusted query params. Invalid input falls back to the default range and reports why. */
export function parseDashboardQuery(params: RawParams): { query: DashboardQuery; error?: string } {
  const get = (k: string) => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    return Array.isArray(v) ? v[0] : (v ?? undefined);
  };
  const parsed = dashboardQuerySchema.safeParse({ range: get("range"), from: get("from"), to: get("to"), category: get("category") });
  if (parsed.success) return { query: parsed.data };
  return { query: dashboardQuerySchema.parse({}), error: parsed.error.issues[0]?.message ?? "Invalid filters." };
}
