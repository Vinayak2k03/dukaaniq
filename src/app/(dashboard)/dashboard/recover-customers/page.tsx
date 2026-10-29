import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Recover Customers" };

export default async function Page() {
  await requireSession();
  return (
    <ComingSoon
      title="Recover Customers"
      description="Find regular customers who have stopped visiting and get suggestions to bring them back."
    />
  );
}
