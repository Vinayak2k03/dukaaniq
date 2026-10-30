export type ChartPoint = { label: string; value: number; display: string };

/** Simple accessible bar chart: bars are decorative, the data table is the accessible equivalent. */
export function TrendChart({ title, points, color }: { title: string; points: ChartPoint[]; color: string }) {
  const max = Math.max(...points.map((p) => p.value), 0);
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <figure>
      <div className="flex h-40 items-end gap-px" aria-hidden="true">
        {points.map((p) => (
          <div key={p.label} title={`${p.label}: ${p.display}`} className="flex h-full min-w-px flex-1 items-end">
            <div className={`w-full rounded-t-sm ${color}`} style={{ height: max === 0 ? "0%" : `${(p.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      {first && last ? (
        <figcaption className="mt-2 flex justify-between text-xs text-slate-500">
          <span>{first.label}</span>
          <span>{last.label}</span>
        </figcaption>
      ) : null}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period starting</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
