import { RANGE_OPTIONS, type DashboardQuery } from "@/lib/validation/dashboard";
import { Calendar, Filter } from "@/components/ui/icons";

const selectClass =
  "rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171A23] shadow-[0_1px_2px_rgba(16,24,40,0.03)] focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20";

const inputClass =
  "rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs text-[#171A23] shadow-[0_1px_2px_rgba(16,24,40,0.03)] focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20";

export function FilterBar({ query, categories }: { query: DashboardQuery; categories: string[] }) {
  return (
    <form
      method="get"
      action="/dashboard"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E4E9] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[#737B8C]">
          <Calendar size={15} className="text-[#4338CA]" />
          <span>Period:</span>
        </div>

        <select id="range" name="range" defaultValue={query.range} className={selectClass}>
          {RANGE_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs text-[#94A3B8]">or custom:</span>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={query.from}
            aria-label="Start date"
            className={inputClass}
          />
          <span className="text-xs text-[#94A3B8]">&rarr;</span>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={query.to}
            aria-label="End date"
            className={inputClass}
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="category" className="text-xs font-medium text-[#737B8C]">
            Category:
          </label>
          <select id="category" name="category" defaultValue={query.category ?? ""} className={selectClass}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-3.5 py-1.5 text-xs font-medium text-white shadow-[0_1px_2px_rgba(67,56,202,0.2)] transition-colors hover:bg-[#3730A3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338CA] focus-visible:ring-offset-2 cursor-pointer"
      >
        <Filter size={13} />
        <span>Apply Filters</span>
      </button>
    </form>
  );
}
