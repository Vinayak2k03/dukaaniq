import { RANGE_OPTIONS, type DashboardQuery } from "@/lib/validation/dashboard";

const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/30";

export function FilterBar({ query, categories }: { query: DashboardQuery; categories: string[] }) {
  return (
    <form method="get" action="/dashboard" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <label htmlFor="range" className="block text-xs font-medium text-slate-600">Period</label>
        <select id="range" name="range" defaultValue={query.range} className={control}>
          {RANGE_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="from" className="block text-xs font-medium text-slate-600">From (custom)</label>
        <input id="from" name="from" type="date" defaultValue={query.from} className={control} />
      </div>
      <div>
        <label htmlFor="to" className="block text-xs font-medium text-slate-600">To (custom)</label>
        <input id="to" name="to" type="date" defaultValue={query.to} className={control} />
      </div>
      <div>
        <label htmlFor="category" className="block text-xs font-medium text-slate-600">Product category</label>
        <select id="category" name="category" defaultValue={query.category ?? ""} className={control}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2">
        Apply
      </button>
    </form>
  );
}
