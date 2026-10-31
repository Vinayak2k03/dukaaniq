import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { Sparkles } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FB] px-4 py-12 select-none">
      <Link href="/" className="mb-8 flex items-center gap-2.5 group">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4338CA] text-white shadow-[0_2px_6px_rgba(67,56,202,0.3)] transition-transform group-hover:scale-105">
          <Sparkles size={18} />
        </div>
        <span className="font-sans text-xl font-extrabold tracking-tight text-[#171A23]">
          Dukaan<span className="text-[#4338CA]">IQ</span>
        </span>
        <Badge variant="brand" size="sm">
          Enterprise
        </Badge>
      </Link>

      <div className="w-full max-w-md rounded-2xl border border-[#E2E4E9] bg-white p-7 shadow-[0_4px_20px_rgba(16,24,40,0.06)] sm:p-9">
        {children}
      </div>

      <div className="mt-8 text-center text-xs text-[#737B8C]">
        <p>Your shop&apos;s data stays private to your account</p>
      </div>
    </main>
  );
}
