import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Merchant Log In" };

export default function LoginPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-[#171A23]">Welcome back to DukaanIQ</h1>
        <p className="mt-1 text-xs text-[#737B8C]">
          Sign in to access your retail store command centre and udhaar ledger.
        </p>
      </div>

      <LoginForm />

      <p className="mt-6 text-center text-xs text-[#737B8C]">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-[#4338CA] hover:underline">
          Create demo account
        </Link>
      </p>
    </>
  );
}
