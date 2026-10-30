export const ENTRY_TYPE_LABEL = {
  CREDIT_GIVEN: "Credit given",
  REPAYMENT_RECEIVED: "Repayment",
  ADJUSTMENT_INCREASE: "Correction (adds to balance)",
  ADJUSTMENT_DECREASE: "Correction (reduces balance)",
} as const;

export const STATUS_LABEL = {
  NO_CREDIT: "No credit",
  SETTLED: "Settled",
  OVERDUE: "Overdue",
  DUE_TODAY: "Due today",
  UPCOMING: "Upcoming",
} as const;

export const STATUS_STYLE = {
  NO_CREDIT: "bg-slate-100 text-slate-700",
  SETTLED: "bg-emerald-100 text-emerald-800",
  OVERDUE: "bg-red-100 text-red-800",
  DUE_TODAY: "bg-amber-100 text-amber-800",
  UPCOMING: "bg-sky-100 text-sky-800",
} as const;
