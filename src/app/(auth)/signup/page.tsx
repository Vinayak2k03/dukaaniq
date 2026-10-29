import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Start growing your shop with DukaanIQ.</p>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-700 hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
