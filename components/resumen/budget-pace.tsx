import Link from "next/link";
import { ArrowRight, Target, TrendingUp } from "lucide-react";
import { SectionIcon } from "./stat-card";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Presupuesto del mes con marca de ritmo: cuánto del presupuesto de gastos se
 * ha usado y dónde «debería» ir a día de hoy (presupuesto × día / días del
 * mes). Lo gastado de más se ve rayado y con ▲ (no solo por color).
 */
export function BudgetPace({
  spent,
  budget,
  invested,
  investBudget,
  day,
  daysInMonth,
  href,
}: {
  spent: number;
  budget: number;
  invested: number;
  investBudget: number;
  /** Día de hoy si es el mes en curso; null en meses cerrados. */
  day: number | null;
  daysInMonth: number;
  href: string;
}) {
  if (budget <= 0 && investBudget <= 0) {
    return (
      <section aria-labelledby="pace-title" className="h-full rounded-card border bg-card p-4 lg:p-5">
        <h2 id="pace-title" className="flex items-center gap-2 text-sm font-bold">
          <SectionIcon icon={Target} tone="var(--series-expense)" />
          Presupuesto del mes
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Aún no hay presupuesto para este Balance.</p>
        <Link href={href} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-brand hover:underline">
          Ponerlo en Presupuesto <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    );
  }
  const pace = day === null ? 1 : day / daysInMonth;
  const expected = budget * pace;
  const ahead = spent - expected;
  const over = spent > budget;
  const scale = Math.max(budget, spent) || 1;
  const pct = (v: number) => `${(v / scale) * 100}%`;

  return (
    <section aria-labelledby="pace-title" className="h-full rounded-card border bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="pace-title" className="flex items-center gap-2 text-sm font-bold">
          <SectionIcon icon={Target} tone="var(--series-expense)" />
          Presupuesto del mes
        </h2>
        <Link href={href} className="inline-flex min-h-8 items-center gap-0.5 text-xs font-bold text-brand hover:underline">
          Ver <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {budget > 0 && (
        <>
          <p className="mt-1 text-[22px] leading-tight font-extrabold tabular-nums">
            {formatAmount(spent)} <span className="text-sm font-semibold text-muted-foreground">de {formatAmount(budget)}</span>
          </p>
          <div className="relative mt-3 h-3 rounded-full bg-track" role="img" aria-label={`Gastado ${formatAmount(spent)} de ${formatAmount(budget)}`}>
            <div
              className="fc-grow-x absolute inset-y-0 left-0 rounded-full bg-series-expense"
              style={{ width: pct(Math.min(spent, budget)) }}
            />
            {over && (
              <div
                className="fc-grow-x absolute inset-y-0 rounded-r-full"
                style={{
                  left: `calc(${pct(budget)} + 2px)`,
                  width: `calc(${pct(spent - budget)} - 2px)`,
                  background: "repeating-linear-gradient(135deg, var(--warning) 0 3px, transparent 3px 6px)",
                }}
              />
            )}
            {day !== null && !over && (
              // Marca de «hoy»: lo que tocaría llevar gastado; el punto late.
              <div className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${pct(expected)} - 1px)` }}>
                <span className="absolute -top-1.5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-foreground" />
                <span className="absolute -top-1.5 left-1/2 size-2 -translate-x-1/2 animate-ping rounded-full bg-foreground/60 motion-reduce:hidden" />
              </div>
            )}
          </div>
          <p className={cn("mt-2 text-xs", over || ahead > 0.5 ? "font-bold text-warning" : "text-muted-foreground")}>
            {over
              ? `▲ Te pasas en ${formatAmount(spent - budget)}`
              : day === null
                ? `Sobraron ${formatAmount(budget - spent)}`
                : ahead > 0.5
                  ? `▲ Vas ${formatAmount(ahead)} por encima del ritmo (día ${day})`
                  : `Vas ${formatAmount(-ahead)} por debajo del ritmo (día ${day}) · quedan ${formatAmount(budget - spent)}`}
          </p>
          {day !== null && !over && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span aria-hidden className="h-3 w-0.5 rounded-full bg-foreground" /> lo que tocaría llevar gastado hoy
            </p>
          )}
        </>
      )}
      {investBudget > 0 && (
        <div className={cn(budget > 0 && "mt-3 border-t pt-3")}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
              <TrendingUp className="size-3.5" style={{ color: "var(--series-savings)" }} aria-hidden /> Inversión
            </span>
            <span className="tabular-nums">
              <strong>{formatAmount(invested)}</strong> de {formatAmount(investBudget)}
              {invested >= investBudget && <span className="ml-1 font-bold text-positive">✓</span>}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-track" aria-hidden>
            <div className="fc-grow-x h-2 rounded-full bg-series-savings" style={{ width: `${Math.min(100, (invested / investBudget) * 100)}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}
