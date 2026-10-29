import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Log in to manage your shop.</p>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-slate-600">
        New to DukaanIQ?{" "}
        <Link href="/signup" className="font-medium text-indigo-700 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
