import { cn } from "@/lib/utils";
import { formatAmount, formatMonthShort, formatMonthTitle, formatSignedAmount } from "@/lib/format";
import type { CategorySpend, StoreSpend } from "@/lib/calc/supermarket";
import type { SupermarketSummary } from "@/lib/calc/summary";
import { ymKey } from "@/lib/months";
import { Sparkline } from "@/components/resumen/sparkline";

/** Gasto por categoría del mes frente a la media de 12 meses (barra = mes). */
export function CategoryList({ categories, isCurrentMonth }: { categories: CategorySpend[]; isCurrentMonth: boolean }) {
  const max = Math.max(1, ...categories.map((c) => Math.max(c.amount, c.reference ?? 0)));
  return (
    <section className="rounded-card border bg-card p-4 lg:p-5" aria-labelledby="cat-title">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="cat-title" className="text-base font-bold">
          Por categoría
        </h2>
        <span className="text-xs text-muted-foreground">
          mes · vs media 12 m{isCurrentMonth ? " (proporcional)" : ""}
        </span>
      </div>
      {categories.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Sin compras este mes.</p>
      ) : (
        <ul className="space-y-3.5">
          {categories.map((c) => {
            const d = c.deviation;
            const tone = d === null || Math.abs(d) < 0.5 ? null : d > 0 ? "warning" : "positive";
            return (
              <li key={c.catId} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 font-semibold">{c.name}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="font-bold">{formatAmount(c.amount)}</span>{" "}
                    {d !== null && (
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          tone === "warning" && "text-warning",
                          tone === "positive" && "text-positive",
                          tone === null && "text-muted-foreground",
                        )}
                      >
                        {tone === "warning" ? "▲ " : tone === "positive" ? "▼ " : ""}
                        {formatSignedAmount(d)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-track" aria-hidden>
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${(c.amount / max) * 100}%` }} />
                  {c.reference !== null && c.reference > 0 && (
                    <div
                      className="absolute top-0 h-2 w-0.5 bg-foreground/60"
                      style={{ left: `calc(${Math.min(100, (c.reference / max) * 100)}% - 1px)` }}
                    />
                  )}
                </div>
                {c.reference !== null && (
                  <p className="text-[11px] text-muted-foreground tabular-nums">media {formatAmount(c.reference)}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function StoreList({ stores }: { stores: StoreSpend[] }) {
  return (
    <section className="rounded-card border bg-card p-4 lg:p-5" aria-labelledby="store-title">
      <h2 id="store-title" className="mb-3 text-base font-bold">
        Por tienda
      </h2>
      {stores.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Sin compras este mes.</p>
      ) : (
        <ul className="space-y-3">
          {stores.map((s) => (
            <li key={s.store} className="flex items-center gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-[15px] font-extrabold text-brand"
                aria-hidden
              >
                {s.store.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.store}</span>
                <span className="text-xs text-muted-foreground">
                  {s.count === 1 ? "1 compra" : `${s.count} compras`}
                </span>
              </span>
              <span className="text-[15px] font-bold tabular-nums">{formatAmount(s.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Evolution({ summary }: { summary: SupermarketSummary }) {
  const data = summary.spark.map((s) => ({
    key: ymKey(s.ym),
    title: formatMonthTitle(s.ym.year, s.ym.month),
    total: s.total,
  }));
  return (
    <section className="rounded-card border bg-card p-4 lg:p-5" aria-labelledby="evo-title">
      <h2 id="evo-title" className="mb-3 text-base font-bold">
        Evolución 12 meses
      </h2>
      <Sparkline data={data} label="Gasto mensual en supermercado, últimos 12 meses" heightClass="h-28" />
      <div className="mt-1 flex text-[11px] text-muted-foreground" aria-hidden>
        {summary.spark.map((s) => (
          <span key={ymKey(s.ym)} className="flex-1 text-center">
            {formatMonthShort(s.ym.year, s.ym.month).slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Gasto mensual en supermercado</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.title}</th>
              <td>{formatAmount(d.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
