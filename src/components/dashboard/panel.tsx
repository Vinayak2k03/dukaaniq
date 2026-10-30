import type { ReactNode } from "react";
import { Info } from "@/components/ui/icons";

export function Panel({
  title,
  subtitle,
  action,
  badge,
  children,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[#E2E4E9] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F2F5] px-5 py-4">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight text-[#171A23]">{title}</h2>
            {badge}
          </div>
          {subtitle ? <p className="text-xs text-[#737B8C] leading-relaxed">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex items-center gap-2 shrink-0">{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  title = "No data found",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#D0D5DD] bg-[#FAFAFC] px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-[#737B8C]">
        <Info size={20} />
      </div>
      <p className="mt-3 text-sm font-semibold text-[#171A23]">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-[#737B8C] leading-relaxed">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
