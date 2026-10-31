import { requireSession } from "@/server/auth/session";
import { getCurrentMembership, listMemberships } from "@/server/merchant/access";
import { categoryLabel } from "@/lib/validation/merchant";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { getMerchantNotifications } from "@/server/notifications/service";
import { SectionTabs } from "@/components/dashboard/section-tabs";
import { AssistantDock } from "@/components/voice/assistant-dock";
import { env } from "@/lib/env";
import { referenceDateFor } from "@/server/analytics/range";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const [membership, memberships] = await Promise.all([
    getCurrentMembership(session.user.id),
    listMemberships(session.user.id),
  ]);
  const notifications = membership ? await getMerchantNotifications(membership.merchantId) : { items: [], unreadCount: 0 };

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-[#171A23]">
      <Sidebar
        merchantName={membership?.merchant.shopName}
        merchantCategory={membership ? categoryLabel(membership.merchant.businessCategory) : undefined}
        userEmail={session.user.email}
        isOwner={membership?.role === "OWNER"}
      />

      <div className="flex min-w-0 flex-col md:pl-64">
        <DashboardHeader
          sessionUser={{ name: session.user.name, email: session.user.email }}
          currentMembership={membership}
          memberships={memberships}
          notifications={notifications}
        />
        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-28 lg:p-8 lg:pb-28 max-w-7xl w-full mx-auto">
          <SectionTabs />
          {children}
        </main>
        {membership ? <AssistantDock sarvam={Boolean(env.SARVAM_API_KEY)} referenceDate={referenceDateFor(membership.merchant)} /> : null}
      </div>
    </div>
  );
}
