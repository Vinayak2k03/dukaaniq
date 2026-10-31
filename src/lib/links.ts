export type LedgerIntent = "add" | "repay";

/** Ledger page for one customer, optionally opened on a form with the amount (in rupees) already filled in. */
export function ledgerHref(customerId: string, opts: { intent?: LedgerIntent; amountPaise?: number | null } = {}) {
  const p = new URLSearchParams();
  if (opts.intent) p.set("intent", opts.intent);
  if (opts.intent && opts.amountPaise && opts.amountPaise > 0) p.set("amount", String(opts.amountPaise / 100));
  const q = p.toString();
  return `/dashboard/udhaar/${encodeURIComponent(customerId)}${q ? `?${q}` : ""}`;
}

export const actionCentreHref = (recommendationId: string) => `/dashboard/action-centre/${recommendationId}`;
