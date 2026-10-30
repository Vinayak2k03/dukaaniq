import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create Merchant Account" };

export default function SignupPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-[#171A23]">Create Merchant Account</h1>
        <p className="mt-1 text-xs text-[#737B8C]">
          Get started with DukaanIQ to unlock AI retail intelligence.
        </p>
      </div>

      <SignupForm />

      <p className="mt-6 text-center text-xs text-[#737B8C]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[#4338CA] hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
