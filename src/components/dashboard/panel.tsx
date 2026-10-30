import type { ReactNode } from "react";

export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">{message}</p>;
}
