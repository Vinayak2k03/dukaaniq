import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Grow Profit" };

export default async function Page() {
  await requireSession();
  return (
    <ComingSoon
      title="Grow Profit"
      description="Spot products and pricing changes that can improve your margins."
    />
  );
}
