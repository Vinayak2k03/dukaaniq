"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DeclineReason } from "@/generated/prisma/enums";
import { approveSchema, recommendationIdSchema, rejectSchema } from "@/lib/validation/recommendation";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { approveRecommendation, createAlternative, createReminderProposals, executeSimulated, rejectRecommendation, type Result } from "@/server/recommendations/service";

export type DecisionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const strings = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

/** Only the shop owner may decide or run recommendations. This is enforced here, not in the UI. */
async function ownerContext() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) redirect("/onboarding");
  if (membership.role !== "OWNER") return { error: "Only the shop owner can do this." } as const;
  return { merchant: membership.merchant, actor: { userId: session.user.id } } as const;
}

const refresh = () => revalidatePath("/dashboard", "layout");
const settle = (r: Result, success: string): DecisionState => {
  if (!r.ok) return { error: r.error };
  refresh();
  return { success };
};

async function guarded(fn: () => Promise<DecisionState>): Promise<DecisionState> {
  try {
    return await fn();
  } catch (e) {
    console.error("recommendation action failed:", e);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function generateRemindersAction(): Promise<DecisionState> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  return guarded(async () => {
    const r = await createReminderProposals(ctx.merchant, ctx.actor);
    return r.ok ? (refresh(), { success: `${r.created} reminder proposal${r.created === 1 ? "" : "s"} ready for your approval.` }) : { error: r.error };
  });
}

export async function approveAction(_prev: DecisionState, fd: FormData): Promise<DecisionState> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const p = approveSchema.safeParse(strings(fd));
  if (!p.success) return { fieldErrors: p.error.flatten().fieldErrors };
  return guarded(async () => settle(await approveRecommendation(ctx.merchant, ctx.actor, { recommendationId: p.data.recommendationId, version: p.data.version }), "Approved. You can now record the action."));
}

export async function rejectAction(_prev: DecisionState, fd: FormData): Promise<DecisionState> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const p = rejectSchema.safeParse(strings(fd));
  if (!p.success) return { fieldErrors: p.error.flatten().fieldErrors };
  return guarded(async () => settle(await rejectRecommendation(ctx.merchant, ctx.actor, { recommendationId: p.data.recommendationId, version: p.data.version, reason: p.data.reason as DeclineReason, note: p.data.note }), "Rejected. Nothing will be sent."));
}

export async function executeAction(_prev: DecisionState, fd: FormData): Promise<DecisionState> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const p = recommendationIdSchema.safeParse(strings(fd));
  if (!p.success) return { error: "Invalid request." };
  return guarded(async () => {
    const r = await executeSimulated(ctx.merchant, ctx.actor, p.data.recommendationId);
    if (!r.ok) return { error: r.error };
    refresh();
    return { success: r.duplicate ? "Already recorded." : `Recorded as a demo action for ${r.messages} customer${r.messages === 1 ? "" : "s"}. Nothing was sent.` };
  });
}

export async function alternativeAction(_prev: DecisionState, fd: FormData): Promise<DecisionState> {
  const ctx = await ownerContext();
  if ("error" in ctx) return ctx;
  const p = recommendationIdSchema.safeParse(strings(fd));
  if (!p.success) return { error: "Invalid request." };
  let newId: string | null = null;
  const state = await guarded(async () => {
    const r = await createAlternative(ctx.merchant, ctx.actor, p.data.recommendationId);
    if (!r.ok) return { error: r.error };
    newId = r.id;
    return { success: "Alternative created." };
  });
  if (newId) {
    refresh();
    redirect(`/dashboard/action-centre/${newId}`);
  }
  return state;
}
