import type { ConceptSpendRow } from "@/lib/data";
import { formatAmount, formatPercent, formatSignedAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { conceptIcon } from "./concept-icon";

/**
 * Gasto por concepto: barras horizontales (color de la serie Gastos).
 * Si hay presupuesto, marca vertical y texto «de X €»; lo gastado de más va
 * rayado, con ▲ y texto (el color nunca es la única señal).
 */
export function ConceptSpend({ rows, total }: { rows: ConceptSpendRow[]; total: number }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-muted-foreground">Sin gastos este mes.</p>;
  }
  const max = Math.max(...rows.map((r) => Math.max(r.amount, r.budget ?? 0)), 1);

  return (
    <ul className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
      {rows.map((r, i) => {
        const Icon = conceptIcon(r.name, r.parentName);
        const over = r.budget !== null && r.amount > r.budget;
        const share = total > 0 ? r.amount / total : 0;
        return (
          <li key={r.conceptId ?? "none"} className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-xl"
                style={{ background: "color-mix(in oklab, var(--series-expense) 12%, transparent)", color: "var(--series-expense)" }}
              >
                <Icon className="size-4" strokeWidth={2.2} />
              </span>
              <p className="min-w-0 flex-1 truncate font-semibold">
                {r.name}
                {r.parentName && (
                  <span className="ml-1.5 text-xs font-medium text-muted-foreground">{r.parentName}</span>
                )}
                {r.conceptId === null && <span className="sr-only"> (movimientos sin concepto asignado)</span>}
              </p>
              <p className="amount font-bold">{formatAmount(r.amount)}</p>
            </div>
            <div className="relative mt-1.5 ml-11 flex h-2 gap-0.5 rounded-full bg-track" aria-hidden>
              <div
                className={cn("fc-grow-x h-2 rounded-full", r.conceptId === null ? "bg-muted-foreground" : "bg-series-expense")}
                style={{ width: `${Math.max(((over ? (r.budget as number) : r.amount) / max) * 100, r.amount > 0 ? 1.5 : 0)}%`, "--i": i } as React.CSSProperties}
              />
              {over && (
                // Lo gastado de más, rayado (además del ▲ y el texto).
                <div
                  className="h-2 rounded-r-full"
                  style={{
                    width: `${((r.amount - (r.budget as number)) / max) * 100}%`,
                    background: "repeating-linear-gradient(135deg, var(--warning) 0 3px, transparent 3px 6px)",
                  }}
                />
              )}
              {r.budget !== null && (
                <div
                  className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground"
                  style={{ left: `calc(${(r.budget / max) * 100}% - 1px)` }}
                />
              )}
            </div>
            <p className="mt-1 ml-11 flex flex-wrap justify-between gap-x-3 text-[11px] text-muted-foreground tabular-nums">
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
