import type { RecommendationStatus as Status } from "@/generated/prisma/enums";

/** PRD 7.2 approval state machine. A REJECTED recommendation is terminal; an alternative is a NEW recommendation. */
const NEXT: Record<Status, Status[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["EXECUTION_PENDING", "CANCELLED"],
  REJECTED: [],
  EXECUTION_PENDING: ["SENT", "SIMULATED", "FAILED"],
  SENT: ["DELIVERED", "READ", "FAILED"],
  SIMULATED: [],
  DELIVERED: ["READ"],
  READ: [],
  FAILED: [],
  CANCELLED: [],
};

export const canTransition = (from: Status, to: Status) => NEXT[from].includes(to);

export const OPEN_STATUSES: Status[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "EXECUTION_PENDING"];
export const isOpen = (s: Status) => OPEN_STATUSES.includes(s);

export const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXECUTION_PENDING: "Queued",
  SENT: "Sent",
  SIMULATED: "Simulated (demo only)",
  DELIVERED: "Delivered",
  READ: "Read",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const STATUS_STYLE: Record<Status, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  EXECUTION_PENDING: "bg-sky-100 text-sky-800",
  SENT: "bg-sky-100 text-sky-800",
  SIMULATED: "bg-violet-100 text-violet-800",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  READ: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-slate-100 text-slate-700",
};
