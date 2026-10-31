import "server-only";
import { db } from "@/lib/db";
import { addDays, istYmd } from "@/server/analytics/range";
import { getTipImpacts } from "./impact";
import { parseStaged, rejectedKeysOf } from "./staged";
import { TIP_FAMILIES, type TipFamily, type TipHistory } from "./types";

/** Approved tips from the last 14 days are not offered again, even once they have moved past "approved" (sent, simulated). */
const RECENT_DAYS = 14;
const HISTORY_DAYS = 180;
/** A rejected tip is not proposed again for this long. */
const REJECTED_COOLDOWN_DAYS = 30;
/** Measured results are only looked up for the latest few approvals, to keep the first request cheap. */
const MEASURED = 6;

const isFamily = (f: unknown): f is TipFamily => (TIP_FAMILIES as readonly string[]).includes(f as string);

/** What the merchant approved before, and how sales moved afterwards, per tip family. Stored in the tips session snapshot. */
export async function buildHistory(merchantId: string, ref: string): Promise<TipHistory> {
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const recentSince = addDays(istYmd(new Date()), -RECENT_DAYS);
  const rows = await db.approvalDecision.findMany({
    where: { merchantId, decidedAt: { gte: since } },
    select: { decision: true, decidedAt: true, version: { select: { evidence: true } } },
  });
  const families: TipHistory["families"] = {};
  const recentKeys: string[] = [];
  const rejectedKeys: string[] = [];
  const rejectedSince = addDays(istYmd(new Date()), -REJECTED_COOLDOWN_DAYS);
  for (const r of rows) {
    const tip = (r.version.evidence as { tip?: { key?: string; family?: string } } | null)?.tip;
    if (r.decision === "REJECTED" && tip?.key && istYmd(r.decidedAt) >= rejectedSince) rejectedKeys.push(tip.key);
    if (!isFamily(tip?.family)) continue;
    const f = (families[tip.family] ??= { approved: 0, rejected: 0, avgSalesChangePct: null });
    if (r.decision === "APPROVED") {
      f.approved++;
      if (tip.key && istYmd(r.decidedAt) >= recentSince) recentKeys.push(tip.key);
    } else f.rejected++;
  }
  // Tips rejected on the tips screen were never saved as recommendations; their rejection lives on the session.
  const cooldownStart = new Date(Date.now() - REJECTED_COOLDOWN_DAYS * 86_400_000);
  const sessions = await db.tipSession.findMany({ where: { merchantId, updatedAt: { gte: cooldownStart } }, select: { drafts: true } });
  for (const sess of sessions) rejectedKeys.push(...rejectedKeysOf(parseStaged(sess.drafts), cooldownStart));
  const measured = new Map<TipFamily, number[]>();
  for (const i of await getTipImpacts(merchantId, MEASURED)) {
    const pct = i.audience?.changePct ?? i.shop.changePct;
    const verdict = i.audience?.verdict ?? i.shop.verdict;
    if (!isFamily(i.family) || pct === null || verdict === "too-early") continue;
    measured.set(i.family, [...(measured.get(i.family) ?? []), pct]);
  }
  for (const [family, pcts] of measured) {
    const f = families[family];
    if (f) f.avgSalesChangePct = Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10;
  }
  return { asOf: ref, families, recentKeys: [...new Set(recentKeys)], rejectedKeys: [...new Set(rejectedKeys)] };
}

/** Tip keys the owner rejected in the last 30 days, on the tips screen or in the Action Centre. */
export async function recentRejectedKeys(merchantId: string): Promise<string[]> {
  const since = new Date(Date.now() - REJECTED_COOLDOWN_DAYS * 86_400_000);
  const [rows, sessions] = await Promise.all([
    db.approvalDecision.findMany({ where: { merchantId, decision: "REJECTED", decidedAt: { gte: since } }, select: { version: { select: { evidence: true } } } }),
    db.tipSession.findMany({ where: { merchantId, updatedAt: { gte: since } }, select: { drafts: true } }),
  ]);
  const keys = rows.flatMap((r) => ((r.version.evidence as { tip?: { key?: string } } | null)?.tip?.key ? [(r.version.evidence as { tip: { key: string } }).tip.key] : []));
  for (const sess of sessions) keys.push(...rejectedKeysOf(parseStaged(sess.drafts), since));
  return [...new Set(keys)];
}
