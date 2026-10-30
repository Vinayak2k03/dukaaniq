import { addDays } from "@/server/analytics/range";
import { FESTIVALS } from "./festivals";
import type { CustomerFact, ProductFact, TipContext } from "./types";

/** A small deterministic shop for unit tests (reference date = the demo date, a week before Dhanteras). */
export function fixtureContext(over: Partial<TipContext> = {}): TipContext {
  const p = (id: string, name: string, category: string, price: number, cost: number, qty30: number, qtyPrior90: number): ProductFact => ({
    id, name, category, pricePaise: price * 100, costPaise: cost * 100, qty30, qtyPrior90, qty90: qty30 + qtyPrior90 / 1.5,
    revenue90Paise: Math.round((qty30 + qtyPrior90 / 1.5) * price * 100), profit90Paise: Math.round((qty30 + qtyPrior90 / 1.5) * (price - cost) * 100),
  });
  const products = [
    p("tea", "Tata Tea 500g", "Beverages", 245, 205, 30, 90),
    p("sugar", "Sugar 1kg", "Staples", 48, 39, 40, 120),
    p("atta", "Atta 5kg", "Staples", 275, 235, 25, 75),
    p("biscuit", "Biscuits", "Snacks", 25, 18, 60, 180),
    p("milk", "Milk 1L", "Dairy", 60, 52, 80, 240),
    p("soap", "Soap", "Personal Care", 40, 30, 2, 60),
  ];
  const languages = ["HINDI", "HINGLISH", "ENGLISH"] as const;
  const customers: CustomerFact[] = Array.from({ length: 40 }, (_, i) => {
    const inactive = i >= 32;
    const days = inactive ? 40 + i : i % 25;
    return {
      id: `c${String(i).padStart(2, "0")}`,
      name: `Customer ${i}`,
      language: languages[i % 3],
      segment: inactive ? "INACTIVE" : days <= 14 ? "ACTIVE" : "COOLING_OFF",
      daysSince: days,
      lastPurchaseDate: addDays("2026-10-30", -days),
      orders90: inactive ? 1 : 12 - Math.floor(i / 4),
      spend90Paise: inactive ? 30_000 : (40 - i) * 10_000,
      aov90Paise: 30_000 + (i % 5) * 2_000,
      orders180: inactive ? 3 : 20,
      topCategory: i % 2 ? "Staples" : "Beverages",
      optedIn: i % 4 !== 3,
      optedOut: i === 1 || i === 33,
      synthetic: true,
    };
  });
  const cells = [];
  for (let dow = 1; dow <= 7; dow++)
    for (let hour = 8; hour < 20; hour++) {
      const orders = dow === 2 && hour === 14 ? 1 : dow === 2 && hour === 15 ? 0 : dow === 6 && (hour === 18 || hour === 19) ? 10 : 3;
      cells.push({ dow, hour, orders, netSalesPaise: orders * 30_000 });
    }
  const daily = Array.from({ length: 180 }, (_, i) => {
    const date = addDays("2026-05-04", i);
    return { date, netSalesPaise: date >= "2026-10-11" && date <= "2026-10-20" ? 70_000 : 50_000, orders: 5 };
  });
  return {
    merchant: { id: "m1", shopName: "Sharma Kirana Store", isDemo: true },
    ref: "2026-10-30",
    nonce: "test-session",
    minMarginPct: 5,
    graceDays: 7,
    shop: { orders90: 450, netSales90Paise: 15_000_000, aov90Paise: 33_000, grossProfit90Paise: 2_200_000 },
    customers,
    products,
    pairs: { list: [{ a: "sugar", b: "tea", support: 12, confidenceAB: 0.3, confidenceBA: 0.4 }], baskets: 450, fromDate: "2026-08-01", toDate: "2026-10-30" },
    heatmap: { cells, weeksObserved: 8, totalOrders: cells.reduce((t, c) => t + c.orders, 0), fromDate: "2026-09-04", toDate: "2026-10-30" },
    daily,
    credit: [
      { customerId: "c00", name: "Customer 0", entryCount: 4, creditGivenPaise: 200_000, repaidPaise: 200_000, balancePaise: 0, overduePaise: 0, pastGracePaise: 0, daysOverdue: 0 },
      { customerId: "c02", name: "Customer 2", entryCount: 3, creditGivenPaise: 150_000, repaidPaise: 100_000, balancePaise: 50_000, overduePaise: 50_000, pastGracePaise: 50_000, daysOverdue: 20 },
      { customerId: "c03", name: "Customer 3", entryCount: 2, creditGivenPaise: 80_000, repaidPaise: 30_000, balancePaise: 50_000, overduePaise: 0, pastGracePaise: 0, daysOverdue: 0 },
    ],
    festivals: FESTIVALS,
    ...over,
  };
}
