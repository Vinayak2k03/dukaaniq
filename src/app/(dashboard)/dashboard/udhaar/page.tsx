import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Udhaar" };

export default async function Page() {
  await requireSession();
  return (
    <ComingSoon
      title="Udhaar"
      description="Keep track of credit given to customers and follow up on pending payments."
    />
  );
}
