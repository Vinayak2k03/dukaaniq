import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your shop" };

export default async function OnboardingPage() {
  const session = await requireSession();
  if (await getCurrentMembership(session.user.id)) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold text-slate-900">Tell us about your shop</h1>
        <p className="mb-6 mt-1 text-sm text-slate-600">
          This helps DukaanIQ personalise your dashboard. You can change it later.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
