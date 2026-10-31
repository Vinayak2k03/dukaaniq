import Link from "next/link";
import { getSession } from "@/server/auth/session";
import {
  Sparkles,
  TrendingUp,
  Shield,
  BookMarked,
  Receipt,
  Users,
  ArrowRight,
  CheckCircle2,
  Wallet,
} from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";

export default async function Home() {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-[#171A23] selection:bg-[#4338CA] selection:text-white">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-[#E2E4E9] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4338CA] text-white shadow-[0_2px_4px_rgba(67,56,202,0.3)] transition-transform group-hover:scale-105">
              <Sparkles size={17} />
            </div>
            <span className="font-sans text-base font-bold tracking-tight text-[#171A23]">
              Dukaan<span className="text-[#4338CA]">IQ</span>
            </span>
            <Badge variant="brand" size="sm">
              AI Copilot
            </Badge>
          </Link>

          <nav className="flex items-center gap-3">
            {session ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#3730A3] transition-colors"
              >
                <span>Command Centre</span>
                <ArrowRight size={13} />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3.5 py-1.5 text-xs font-semibold text-[#525866] hover:text-[#171A23] hover:bg-slate-100 transition-colors"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#3730A3] transition-colors"
                >
                  <span>Start Free</span>
                  <ArrowRight size={13} />
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-[#4338CA] shadow-2xs">
            <Sparkles size={13} />
            <span>Deterministic AI Business Intelligence for Retail Merchants</span>
          </div>

          <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight text-[#171A23] leading-[1.12]">
            The financial operations &amp; <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-[#4338CA] via-[#3B82F6] to-[#4338CA] bg-clip-text text-transparent">
              growth intelligence copilot
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-[#525866] leading-relaxed">
            Eliminate guesswork. Understand real customer lifetime value, recover overdue udhaar with polite multi-lingual AI reminders, and grow retail margins with 100% mathematical precision.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {session ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-[#4338CA] px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-[#3730A3] transition-all"
              >
                <span>Open DukaanIQ Command Centre</span>
                <ArrowRight size={16} />
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#4338CA] px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-[#3730A3] transition-all"
                >
                  <span>Get Started with Demo Store</span>
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-[#D0D5DD] bg-white px-5 py-3 text-sm font-semibold text-[#171A23] shadow-xs hover:bg-[#F8F9FA] transition-colors"
                >
                  Merchant Log In
                </Link>
              </>
            )}
          </div>

          {/* Social Proof Strip */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-[#737B8C]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <span>100% Deterministic Calculations</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <span>Append-Only PostgreSQL Ledger</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <span>Human-in-the-Loop AI Governance</span>
            </span>
          </div>
        </div>

        {/* Product UI Mockup */}
        <div className="mx-auto mt-14 max-w-5xl rounded-2xl border border-[#E2E4E9] bg-white p-3 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
          <div className="rounded-xl border border-[#F0F2F5] bg-[#F8F9FB] p-4 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#E2E4E9]">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-400" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="ml-2 font-mono text-xs text-[#737B8C]">dukaaniq.internal / command-centre</span>
              </div>
              <Badge variant="neutral" size="sm">Illustrative preview</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
              <div className="rounded-lg border border-[#E2E4E9] bg-white p-3.5">
                <p className="text-[11px] font-semibold uppercase text-[#737B8C]">Net Revenue</p>
                <p className="font-mono text-lg font-bold text-[#171A23] tabular-nums mt-1">₹1,75,059.93</p>
                <p className="text-[10px] text-emerald-700 font-semibold mt-1">Sample figures, not live</p>
              </div>
              <div className="rounded-lg border border-[#E2E4E9] bg-white p-3.5">
                <p className="text-[11px] font-semibold uppercase text-[#737B8C]">Completed Orders</p>
                <p className="font-mono text-lg font-bold text-[#171A23] tabular-nums mt-1">868 paid orders</p>
                <p className="text-[10px] text-[#737B8C] mt-1">Paid sales only</p>
              </div>
              <div className="rounded-lg border border-[#E2E4E9] bg-white p-3.5">
                <p className="text-[11px] font-semibold uppercase text-[#737B8C]">Customers</p>
                <p className="font-mono text-lg font-bold text-[#171A23] tabular-nums mt-1">120 customers</p>
                <p className="text-[10px] text-[#737B8C] mt-1">Segmented by last visit</p>
              </div>
              <div className="rounded-lg border border-[#E2E4E9] bg-white p-3.5">
                <p className="text-[11px] font-semibold uppercase text-[#737B8C]">Approval First</p>
                <p className="font-mono text-lg font-bold text-[#4338CA] tabular-nums mt-1">You decide</p>
                <p className="text-[10px] text-indigo-700 font-semibold mt-1">Nothing is sent unapproved</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillars Grid */}
      <section className="border-t border-[#E2E4E9] bg-white px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#4338CA]">
              Production-Grade Architecture
            </h2>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#171A23]">
              Built for retail reality, not hypothetical demos.
            </p>
            <p className="mt-3 max-w-2xl mx-auto text-sm text-[#525866]">
              Every metric, customer segment and repayment line is calculated directly from integer paise records.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-[#E2E4E9] bg-[#FAFBFD] p-6 shadow-2xs hover:border-[#CBD5E1] transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4338CA] text-white">
                <TrendingUp size={20} />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#171A23]">Deterministic Financial Analytics</h3>
              <p className="mt-2 text-xs text-[#525866] leading-relaxed">
                Sales summaries come directly from verified transaction tables. Zero LLM hallucinations on your core financial figures.
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E4E9] bg-[#FAFBFD] p-6 shadow-2xs hover:border-[#CBD5E1] transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4338CA] text-white">
                <BookMarked size={20} />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#171A23]">Append-Only Udhaar Ledger</h3>
              <p className="mt-2 text-xs text-[#525866] leading-relaxed">
                Credit history cannot be altered or silently deleted. Discrepancies are resolved with explicit audit correction lines.
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E4E9] bg-[#FAFBFD] p-6 shadow-2xs hover:border-[#CBD5E1] transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4338CA] text-white">
                <Sparkles size={20} />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#171A23]">Governed AI Action Centre</h3>
              <p className="mt-2 text-xs text-[#525866] leading-relaxed">
                Sarvam AI drafts multi-lingual Hindi &amp; Hinglish reminder copy. Nothing is dispatched without explicit merchant approval.
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E4E9] bg-[#FAFBFD] p-6 shadow-2xs hover:border-[#CBD5E1] transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4338CA] text-white">
                <Users size={20} />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#171A23]">Automated Win-Back Workflows</h3>
              <p className="mt-2 text-xs text-[#525866] leading-relaxed">
                Identifies inactive customers who have ceased shopping for &gt;30 days and suggests targeted promotional codes.
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E4E9] bg-[#FAFBFD] p-6 shadow-2xs hover:border-[#CBD5E1] transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4338CA] text-white">
                <Receipt size={20} />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#171A23]">Multi-Channel Payment Mix</h3>
              <p className="mt-2 text-xs text-[#525866] leading-relaxed">
                Reconcile Paytm QR, UPI intents, Cash counters and Debit Card settlements in a unified cashflow view.
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E4E9] bg-[#FAFBFD] p-6 shadow-2xs hover:border-[#CBD5E1] transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4338CA] text-white">
                <Shield size={20} />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#171A23]">Multi-Tenant Neon PostgreSQL</h3>
              <p className="mt-2 text-xs text-[#525866] leading-relaxed">
                Secure merchant isolation with row-level ownership, Better Auth session authentication, and automated backup snapshots.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E2E4E9] bg-[#F8F9FB] px-4 py-8 text-xs text-[#737B8C]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#171A23]">DukaanIQ</span>
            <span>&middot; Enterprise Retail Intelligence &amp; Copilot Platform</span>
          </div>
          <div>
            <span>Powered by Neon PostgreSQL, Better Auth &amp; Sarvam AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
