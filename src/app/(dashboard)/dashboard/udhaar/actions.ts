"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { correctionSchema, creditEntrySchema } from "@/lib/validation/credit";
import { requireSession } from "@/server/auth/session";
import { createCorrection, createCreditEntry, type WriteResult } from "@/server/credit/service";
import { getCurrentMembership } from "@/server/merchant/access";

export type LedgerFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const strings = (formData: FormData) => Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));

async function context() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) redirect("/onboarding");
  return { actor: { userId: session.user.id }, merchant: membership.merchant, role: membership.role };
}

function toState(result: WriteResult, savedMessage: string): LedgerFormState {
  if (!result.ok) return result.field ? { fieldErrors: { [result.field]: [result.error] } } : { error: result.error };
  revalidatePath("/dashboard/udhaar", "layout");
  return { success: result.duplicate ? "Already saved." : savedMessage };
}

async function handleEntry(formData: FormData, type: "CREDIT_GIVEN" | "REPAYMENT_RECEIVED", saved: string): Promise<LedgerFormState> {
  const { actor, merchant } = await context();
  const parsed = creditEntrySchema.safeParse({ ...strings(formData), type });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    return toState(await createCreditEntry(merchant, actor, parsed.data), saved);
  } catch (e) {
    console.error("credit entry failed:", e);
    return { error: "Could not save this entry. Please try again." };
  }
}

export const addCreditAction = async (_prev: LedgerFormState, formData: FormData) => handleEntry(formData, "CREDIT_GIVEN", "Credit added.");
export const recordRepaymentAction = async (_prev: LedgerFormState, formData: FormData) => handleEntry(formData, "REPAYMENT_RECEIVED", "Repayment recorded.");

export async function correctEntryAction(_prev: LedgerFormState, formData: FormData): Promise<LedgerFormState> {
  const { actor, merchant, role } = await context();
  if (role !== "OWNER") return { error: "Only the shop owner can correct ledger entries." };
  const parsed = correctionSchema.safeParse(strings(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    return toState(await createCorrection(merchant, actor, parsed.data), "Correction recorded.");
  } catch (e) {
    console.error("credit correction failed:", e);
    return { error: "Could not save this correction. Please try again." };
  }
}
