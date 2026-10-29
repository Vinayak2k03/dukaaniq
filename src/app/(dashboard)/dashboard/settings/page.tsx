import type { Metadata } from "next";
import { categoryLabel } from "@/lib/validation/merchant";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";

export const metadata: Metadata = { title: "Settings" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Account</h2>
        <dl className="mt-2 divide-y divide-slate-100">
          <Row label="Name" value={session.user.name} />
          <Row label="Email" value={session.user.email} />
        </dl>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Shop</h2>
        {membership ? (
          <dl className="mt-2 divide-y divide-slate-100">
            <Row label="Shop name" value={membership.merchant.shopName} />
            <Row label="Category" value={categoryLabel(membership.merchant.businessCategory)} />
            <Row label="Your role" value={membership.role === "OWNER" ? "Owner" : "Staff"} />
          </dl>
        ) : (
          <p className="mt-2 text-slate-600">No shop set up yet.</p>
        )}
        <p className="mt-4 text-sm text-slate-500">Editing account and shop details will be available in a later update.</p>
      </section>
    </div>
  );
}
