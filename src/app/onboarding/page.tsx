import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { OnboardingForm } from "./onboarding-form";
import { Sparkles } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Set Up Your Dukaan" };

export default async function OnboardingPage() {
  const session = await requireSession();
  if (await getCurrentMembership(session.user.id)) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FB] px-4 py-12 select-none">
      <Link href="/" className="mb-8 flex items-center gap-2.5 group">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4338CA] text-white shadow-[0_2px_6px_rgba(67,56,202,0.3)] transition-transform group-hover:scale-105">
          <Sparkles size={18} />
        </div>
        <span className="font-sans text-xl font-extrabold tracking-tight text-[#171A23]">
          Dukaan<span className="text-[#4338CA]">IQ</span>
        </span>
        <Badge variant="brand" size="sm">
          Shop Setup
        </Badge>
      </Link>

      <div className="w-full max-w-md rounded-2xl border border-[#E2E4E9] bg-white p-7 shadow-[0_4px_20px_rgba(16,24,40,0.06)] sm:p-9">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-[#171A23]">Tell us about your shop</h1>
          <p className="mt-1 text-xs text-[#737B8C]">
            Personalize your intelligence dashboard, inventory categories and udhaar grace policies.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </main>
  );
}
