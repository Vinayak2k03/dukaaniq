import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { DashboardNav } from "@/components/dashboard/nav";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership, listMemberships } from "@/server/merchant/access";
import { switchMerchantAction } from "@/server/merchant/actions";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const [membership, memberships] = await Promise.all([getCurrentMembership(session.user.id), listMemberships(session.user.id)]);

  return (
    <div className="min-h-screen bg-slate-50 md:grid md:grid-cols-[16rem_1fr]">
      <aside className="border-b border-slate-200 bg-white p-4 md:border-b-0 md:border-r">
        <Link href="/dashboard" className="mb-4 block text-xl font-bold text-indigo-700">
          DukaanIQ
        </Link>
        <DashboardNav />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          {memberships.length > 1 ? (
            <form action={switchMerchantAction} className="flex items-center gap-2">
              <label htmlFor="merchantId" className="text-sm text-slate-600">Shop</label>
              <select
                id="merchantId"
                name="merchantId"
                defaultValue={membership?.merchantId}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                {memberships.map((m) => (
                  <option key={m.merchantId} value={m.merchantId}>{m.merchant.shopName}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
                Switch
              </button>
            </form>
          ) : (
            <p className="text-sm font-medium text-slate-900">{membership?.merchant.shopName ?? "No shop yet"}</p>
          )}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{session.user.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                Log out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
