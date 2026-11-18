import type { ConceptSpendRow } from "@/lib/data";
import { formatAmount, formatPercent, formatSignedAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Gasto por concepto: barras horizontales (una serie, color acento).
 * Si hay presupuesto, marca vertical y texto «de X €»; exceso en --warning
 * con ▲ y texto (el color nunca es la única señal).
 */
export function ConceptSpend({ rows, total }: { rows: ConceptSpendRow[]; total: number }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-muted-foreground">Sin gastos este mes.</p>;
  }
  const max = Math.max(...rows.map((r) => Math.max(r.amount, r.budget ?? 0)), 1);

  return (
    <ul className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
      {rows.map((r) => {
        const over = r.budget !== null && r.amount > r.budget;
        const share = total > 0 ? r.amount / total : 0;
        return (
          <li key={r.conceptId ?? "none"} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-semibold">
                {r.name}
                {r.parentName && (
                  <span className="ml-1.5 text-xs font-medium text-muted-foreground">{r.parentName}</span>
                )}
                {r.conceptId === null && <span className="sr-only"> (movimientos sin concepto asignado)</span>}
              </p>
              <p className="amount font-bold">{formatAmount(r.amount)}</p>
            </div>
            <div className="relative mt-1.5 h-2 rounded-full bg-track" aria-hidden>
              <div
                className={cn("h-2 rounded-full", r.conceptId === null ? "bg-muted-foreground" : over ? "bg-warning" : "bg-brand")}
                style={{ width: `${Math.max((r.amount / max) * 100, r.amount > 0 ? 1.5 : 0)}%` }}
              />
              {r.budget !== null && (
                <div
                  className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground"
                  style={{ left: `calc(${(r.budget / max) * 100}% - 1px)` }}
                />
              )}
            </div>
            <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-muted-foreground tabular-nums">
              <span>{formatPercent(share)} del gasto</span>
              {r.budget !== null && (
                <span className={cn(over && "font-bold text-warning")}>
                  {over ? `▲ ${formatSignedAmount(r.amount - r.budget)} sobre ` : "de "}
                  {formatAmount(r.budget)} presupuestados
                </span>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
