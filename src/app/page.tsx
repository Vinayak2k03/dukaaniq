import Link from "next/link";
import { getSession } from "@/server/auth/session";

const btn =
  "rounded-lg px-5 py-2.5 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2";

export default async function Home() {
  const session = await getSession();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">
        <span className="text-indigo-700">DukaanIQ</span> &mdash; your shop&apos;s growth copilot
      </h1>
      <p className="mt-4 max-w-xl text-lg text-slate-600">
        Understand your customers, grow your profit and keep track of udhaar, all in one place.
      </p>
      <div className="mt-8 flex gap-3">
        {session ? (
          <Link href="/dashboard" className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link href="/signup" className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>
              Sign up
            </Link>
            <Link href="/login" className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100`}>
              Log in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
