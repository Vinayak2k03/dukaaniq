import type { Metadata } from "next";
import { db } from "@/lib/db";
import { categoryLabel } from "@/lib/validation/merchant";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/dashboard/panel";
import { Settings, Shield, Store, Users, CheckCircle2 } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Settings" };

function SettingRow({
  label,
  value,
  description,
  badge,
}: {
  label: string;
  value: React.ReactNode;
  description?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <dt className="text-xs font-semibold text-[#171A23]">{label}</dt>
          {badge}
        </div>
        {description && <p className="text-[11px] text-[#737B8C]">{description}</p>}
      </div>
      <dd className="font-mono text-xs font-medium text-[#171A23] sm:text-right">{value}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);

  // Credit policy from database
  const policy = membership
    ? await db.creditPolicy.findUnique({
        where: { merchantId: membership.merchant.id },
      })
    : null;

  // Real connectivity probe; the badge below reflects this, not a fixed label.
  const dbOnline = await db.$queryRaw`SELECT 1`.then(
    () => true,
    () => false,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="border-b border-[#E2E4E9] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">System &amp; Shop Settings</h1>
        <p className="mt-1 text-xs text-[#737B8C]">
          Manage your merchant profile, authentication credentials, credit policies and database integrations.
        </p>
      </div>

      {/* Account Settings */}
      <Panel
        title="Merchant User Account"
        subtitle="Your credentials authenticated via Better Auth"
        badge={<Badge variant="brand" size="sm">Auth Profile</Badge>}
      >
        <dl className="divide-y divide-[#F0F2F5]">
          <SettingRow label="Account Name" value={session.user.name} />
          <SettingRow
            label="Email Address"
            value={session.user.email}
            badge={<Badge variant="success" size="sm">Verified</Badge>}
          />
          <SettingRow
            label="User Identity ID"
            value={<code className="text-[11px] text-[#737B8C]">{session.user.id}</code>}
          />
          <SettingRow
            label="Access Role"
            value={membership?.role === "OWNER" ? "Store Owner (Full Administrative Rights)" : "Staff Member"}
          />
        </dl>
      </Panel>

      {/* Shop Profile */}
      <Panel
        title="Dukaan Information"
        subtitle="Retail business identity and location"
        badge={<Badge variant="neutral" size="sm">Store Profile</Badge>}
      >
        {membership ? (
          <dl className="divide-y divide-[#F0F2F5]">
            <SettingRow
              label="Shop Name"
              value={membership.merchant.shopName}
              description="Primary trade name displayed on customer receipts"
            />
            <SettingRow
              label="Business Category"
              value={categoryLabel(membership.merchant.businessCategory)}
            />
            <SettingRow
              label="Operating Timezone"
              value={membership.merchant.timezone ?? "Asia/Kolkata (IST +05:30)"}
            />
            <SettingRow
              label="Store Environment"
              value={
                membership.merchant.isDemo ? (
                  <Badge variant="warning" size="sm">
                    Demo Mode (Synthetic Dataset Active)
                  </Badge>
                ) : (
                  <Badge variant="success" size="sm">
                    Live Production Store
                  </Badge>
                )
              }
            />
          </dl>
        ) : (
          <p className="text-xs text-[#737B8C]">No store is currently associated with this account.</p>
        )}
      </Panel>

      {/* Credit Policy Settings */}
      <Panel
        title="Udhaar &amp; Credit Governance Policy"
        subtitle="Deterministic rules regulating overdue calculations and grace periods"
        badge={<Badge variant="brand" size="sm">Policy</Badge>}
      >
        <dl className="divide-y divide-[#F0F2F5]">
          <SettingRow
            label="Grace Period"
            value={`${policy?.gracePeriodDays ?? 0} days`}
            description="Days after payment due date before an overdue reminder proposal is prepared"
          />
          <SettingRow
            label="Automatic Penalty"
            value={policy?.penaltyEnabled ? "Enabled" : "Disabled (No automated financial penalty)"}
            description="DukaanIQ never charges customers without explicit owner ledger entries"
          />
          <SettingRow
            label="Ledger Integrity"
            value="Append-only"
            description="Database triggers reject updates and deletes on ledger entries; corrections are new adjustment entries"
          />
        </dl>
      </Panel>

      {/* Connected Integrations & Health */}
      <Panel
        title="Connected Infrastructure &amp; AI Integrations"
        subtitle="Platform runtime and database connectivity"
        badge={dbOnline ? <Badge variant="success" size="sm">Database reachable</Badge> : <Badge variant="danger" size="sm">Database unreachable</Badge>}
      >
        <dl className="divide-y divide-[#F0F2F5]">
          <SettingRow
            label="Database Cluster"
            value="PostgreSQL"
            badge={<span className={`h-2 w-2 rounded-full ${dbOnline ? "bg-emerald-500" : "bg-rose-500"}`} />}
          />
          <SettingRow
            label="Authentication Engine"
            value="Better Auth (session cookies)"
          />
          <SettingRow
            label="AI Copilot Model"
            value="Sarvam AI Indic Engine + Deterministic Fallback"
          />
        </dl>
      </Panel>
    </div>
  );
}
