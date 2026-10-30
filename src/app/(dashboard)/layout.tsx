import { requireSession } from "@/server/auth/session";
import { getCurrentMembership, listMemberships } from "@/server/merchant/access";
import { categoryLabel } from "@/lib/validation/merchant";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const [membership, memberships] = await Promise.all([
    getCurrentMembership(session.user.id),
    listMemberships(session.user.id),
  ]);

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
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
