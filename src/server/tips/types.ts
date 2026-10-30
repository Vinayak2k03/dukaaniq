import type { RecommendationType } from "@/generated/prisma/enums";
import type { Heatmap, ProductPair } from "@/server/analytics/insights-math";
import type { Segment } from "@/server/analytics/queries";
import type { Language, MessageKind } from "@/server/recommendations/text";
import type { Festival } from "./festivals";

/**
 * Growth-tips engine types. Generators are pure functions of a TipContext (a snapshot of deterministic
 * query results) and a TipFeedback (structured merchant feedback). Every number in a Candidate is
 * computed here; an LLM later only writes the wording (message + "why").
 */

export const TIP_FAMILIES = ["LOYALTY", "FESTIVE", "OFF_PEAK", "CREDIT_REMINDER", "WINBACK", "BUNDLE", "SLOW_MOVING", "PEAK_TIMING"] as const;
export type TipFamily = (typeof TIP_FAMILIES)[number];

export type CustomerFact = {
  id: string;
  name: string;
  language: Language;
  segment: Segment;
  daysSince: number | null;
  lastPurchaseDate: string | null;
  orders90: number;
  spend90Paise: number;
  aov90Paise: number;
  orders180: number;
  topCategory: string | null;
  optedIn: boolean;
  optedOut: boolean;
  synthetic: boolean;
};

export type ProductFact = {
  id: string;
  name: string;
  category: string | null;
  pricePaise: number;
  costPaise: number;
  qty30: number;
  /** Quantity in the 90 days before the last 30 (days 31-120 back). */
  qtyPrior90: number;
  qty90: number;
  revenue90Paise: number;
  profit90Paise: number;
};

export type CreditFact = {
  customerId: string;
  name: string;
  entryCount: number;
  creditGivenPaise: number;
  repaidPaise: number;
  balancePaise: number;
  overduePaise: number;
  pastGracePaise: number;
  daysOverdue: number;
};

export type DailyPoint = { date: string; netSalesPaise: number; orders: number };

export type TipContext = {
  merchant: { id: string; shopName: string; isDemo: boolean };
  ref: string;
  /** Seed for coupon-code suffixes, so codes are unique per session but reproducible in tests. */
  nonce: string;
  minMarginPct: number;
  graceDays: number;
  shop: { orders90: number; netSales90Paise: number; aov90Paise: number; grossProfit90Paise: number };
  customers: CustomerFact[];
  products: ProductFact[];
  pairs: { list: ProductPair[]; baskets: number; fromDate: string; toDate: string };
  heatmap: Heatmap;
  daily: DailyPoint[];
  credit: CreditFact[];
  festivals: Festival[];
};

export type TimeWindow = { dow: number; startHour: number; endHour: number };
export type ComboItem = { productId: string; name: string; pricePaise: number; costPaise: number };

export type Offer =
  | {
      kind: "COUPON";
      couponCode: string;
      discountPct: number;
      capPaise: number;
      minSpendPaise: number;
      eligibleCategories: string[] | "ALL";
      excludedProducts: string[];
      validFrom: string;
      validTill: string;
      timeWindow: TimeWindow | null;
      usageLimitPerCustomer: number;
    }
  | { kind: "COMBO"; items: ComboItem[]; listPricePaise: number; comboPricePaise: number; validFrom: string; validTill: string; usageLimitPerCustomer: number }
  | { kind: "CREDIT_LIMIT"; limits: { customerId: string; name: string; currentBalancePaise: number; limitPaise: number }[]; maxExposurePaise: number }
  | { kind: "REMINDER"; amountPaise: number; dueDate: string }
  | { kind: "NONE"; action: string };

export type AudienceMember = {
  customerId: string;
  name: string;
  language: Language;
  lastPurchaseDate: string | null;
  daysSince: number | null;
  optedIn: boolean;
  synthetic: boolean;
};

export type AudienceRule = "spend" | "frequency" | "segment" | "single";

export type Candidate = {
  /** Stable across sessions (no codes or dates), used for "never show twice" and open-recommendation checks. */
  key: string;
  family: TipFamily;
  type: RecommendationType;
  score: number;
  title: string;
  /** Deterministic merchant-facing explanation (the fallback when AI wording is unavailable). */
  why: string;
  /** Evidence sentences an AI "why" may restate; it may use no other number. */
  whyFacts: string[];
  /** null = in-store tip with no customer message. */
  messageKind: MessageKind | null;
  festivalName: string | null;
  offer: Offer;
  audience: AudienceMember[];
  audienceRule: AudienceRule;
  categories: string[];
  productIds: string[];
  evidence: Record<string, unknown>;
  economics: Record<string, unknown>;
  changes: string[];
};

export type TipFeedback = {
  /** Ceiling for any coupon / combo discount (COST_TOO_HIGH steps it down). */
  maxDiscountPct: number | null;
  /** Each step halves the audience of customer-messaging tips. */
  audienceShrink: number;
  audienceRule: "spend" | "frequency" | null;
  excludeCustomerIds: string[];
  excludeCategories: string[];
  excludeProductIds: string[];
  excludeFamilies: TipFamily[];
  demoteFamilies: TipFamily[];
  preferFamilies: TipFamily[];
  excludeSlots: string[];
  excludeFestivals: string[];
  validityShiftDays: number;
  preferLargeAudience: boolean;
  /** Recommendations whose rejection reason is already applied here (so an alternative does not apply it twice). */
  appliedRejections: string[];
  /** Human-readable log of what was applied, shown as "changes from previous". */
  notes: string[];
};

export const emptyFeedback = (): TipFeedback => ({
  maxDiscountPct: null,
  audienceShrink: 0,
  audienceRule: null,
  excludeCustomerIds: [],
  excludeCategories: [],
  excludeProductIds: [],
  excludeFamilies: [],
  demoteFamilies: [],
  preferFamilies: [],
  excludeSlots: [],
  excludeFestivals: [],
  validityShiftDays: 0,
  preferLargeAudience: false,
  appliedRejections: [],
  notes: [],
});
