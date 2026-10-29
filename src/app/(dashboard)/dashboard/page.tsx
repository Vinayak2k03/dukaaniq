import type { Metadata } from "next";
import Link from "next/link";
import { categoryLabel } from "@/lib/validation/merchant";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";

export const metadata: Metadata = { title: "Dashboard" };

const upcoming = [
  { title: "Recover Customers", text: "Win back customers who stopped visiting." },
  { title: "Grow Profit", text: "Find ways to improve your margins." },
  { title: "Udhaar", text: "Track credit and pending payments." },
];

export default async function DashboardPage() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Namaste, {session.user.name}</h1>
        {membership ? (
          <p className="mt-1 text-slate-600">
            {membership.merchant.shopName} &middot; {categoryLabel(membership.merchant.businessCategory)}
          </p>
        ) : (
          <div className="mt-3">
            <p className="text-slate-600">Set up your shop to get started.</p>
            <Link
              href="/onboarding"
              className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
            >
              Set up your shop
            </Link>
          </div>
        )}
      </section>
      <section aria-labelledby="upcoming" className="space-y-3">
        <h2 id="upcoming" className="text-lg font-semibold text-slate-900">
          What&apos;s coming
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {upcoming.map((u) => (
            <li key={u.title} className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                Coming soon
              </span>
              <h3 className="mt-3 font-medium text-slate-900">{u.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{u.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
