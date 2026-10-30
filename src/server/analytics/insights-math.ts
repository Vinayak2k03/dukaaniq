/**
 * Pure helpers behind the insight queries (no database imports, so they can be unit tested).
 * Weekday is ISO (1 = Monday ... 7 = Sunday); hours are Asia/Kolkata clock hours.
 */

export type HeatCell = { dow: number; hour: number; orders: number; netSalesPaise: number };
export type Heatmap = { cells: HeatCell[]; weeksObserved: number; totalOrders: number; fromDate: string; toDate: string };

export type PairRow = { a: string; b: string; support: number };
export type ProductPair = {
  a: string;
  b: string;
  /** Number of paid sales that contain both products. */
  support: number;
  /** P(b in basket | a in basket) and the reverse, from basket counts. */
  confidenceAB: number;
  confidenceBA: number;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Adds confidence to raw co-occurrence counts. `basketsWith` = number of paid sales containing each product. */
export function withConfidence(rows: PairRow[], basketsWith: Map<string, number>): ProductPair[] {
  return rows
    .map((r) => {
      const na = basketsWith.get(r.a) ?? 0;
      const nb = basketsWith.get(r.b) ?? 0;
      return { ...r, confidenceAB: na ? round3(r.support / na) : 0, confidenceBA: nb ? round3(r.support / nb) : 0 };
    })
    .sort((x, y) => y.support - x.support || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

export type Slot = { dow: number; startHour: number; endHour: number; orders: number; netSalesPaise: number };

/**
 * Groups hourly cells into fixed windows of `width` hours, aligned to the shop's first open hour.
 * Only windows with at least one recorded sale are returned ("the shop is clearly open then").
 */
export function slotsFrom(cells: HeatCell[], width = 2): Slot[] {
  const open = cells.filter((c) => c.orders > 0);
  if (open.length === 0) return [];
  const first = Math.min(...open.map((c) => c.hour));
  const map = new Map<string, Slot>();
  for (const c of open) {
    const start = first + Math.floor((c.hour - first) / width) * width;
    const k = `${c.dow}:${start}`;
    const s = map.get(k) ?? { dow: c.dow, startHour: start, endHour: start + width, orders: 0, netSalesPaise: 0 };
    s.orders += c.orders;
    s.netSalesPaise += c.netSalesPaise;
    map.set(k, s);
  }
  return [...map.values()].sort((a, b) => a.dow - b.dow || a.startHour - b.startHour);
}

export const averageOrders = (slots: Slot[]) => (slots.length ? slots.reduce((t, s) => t + s.orders, 0) / slots.length : 0);
