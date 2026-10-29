export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        Coming soon
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-600">{description}</p>
      <p className="mt-4 text-sm text-slate-500">This feature is not available yet.</p>
    </section>
  );
}
