import type { Summary } from "@/lib/data";
import {
  formatAmount,
  formatMonthShort,
  formatMonthTitle,
  formatPercent,
  formatPoints,
  formatSignedPercent,
} from "@/lib/format";
import { ymKey } from "@/lib/months";
import { cn } from "@/lib/utils";
import { yearToDate } from "@/lib/calc/summary";
import { OWNER_LABEL, type Owner } from "@/lib/balance";
import { AmexCard } from "./amex-card";
import { ConceptSpend } from "./concept-spend";
import { Delta } from "./delta";
import { StatCard } from "./stat-card";
import { SupermarketCard } from "./supermarket-card";
import { TrendChart } from "./trend-chart";

/**
 * Resumen (especificación, apartado 7). Solo presentación.
 * Ordenador: 4 tarjetas en fila · gráfico ⅔ + Supermercado/Amex ⅓ ·
 * categorías en 2 columnas.
 */
export function ResumenView({ summary, owner }: { summary: Summary; owner: Owner }) {
  const { current, previous, ym } = summary;

  const change = (a: number, b: number) => (b > 0 ? a / b - 1 : null);
  const incomeChange = change(current.income, previous.income);
  const expenseChange = change(current.expenses, previous.expenses);
  const savingsDiff = current.savings - previous.savings;
  const totalSpend = summary.byConcept.reduce((s, r) => s + r.amount, 0);
  // Acumulado de enero al mes elegido.
  const ytd = yearToDate(summary.trend, ym);
  const ytdNote = (value: string, cls?: string) => (
    <>
      YTD {ym.year}
      <span className="hidden lg:inline">: </span>
      <span className={cn("block lg:inline", cls ?? "font-bold text-foreground")}>{value}</span>
    </>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Ingresos"
          value={formatAmount(current.income)}
          note={ytdNote(formatAmount(ytd.income))}
          footer={
            <Delta
              value={incomeChange}
              text={incomeChange === null ? "" : formatSignedPercent(incomeChange)}
              goodWhenUp
              suffix="vs mes ant."
            />
          }
        />
        <StatCard
          label="Gastos"
          value={formatAmount(current.expenses)}
          note={ytdNote(formatAmount(ytd.expenses))}
          footer={
            <Delta
              value={expenseChange}
              text={expenseChange === null ? "" : formatSignedPercent(expenseChange)}
              goodWhenUp={false}
              suffix="vs mes ant."
            />
          }
        />
        <StatCard
          label="Ahorro"
          value={formatAmount(current.savings)}
          note={ytdNote(formatAmount(ytd.savings), ytd.savings < 0 ? "font-bold text-warning" : undefined)}
          valueClassName={current.savings < 0 ? "text-warning" : undefined}
          footer={
            <Delta
              value={savingsDiff}
              text={formatAmount(Math.abs(savingsDiff))}
              goodWhenUp
              suffix="vs mes ant."
            />
          }
        />
        <StatCard
          label="Tasa de ahorro"
          value={current.savingsRate === null ? "—" : formatPercent(current.savingsRate)}
          note={ytdNote(ytd.savingsRate === null ? "—" : formatPercent(ytd.savingsRate))}
          footer={
            <Delta
              value={summary.savingsRateDeltaPoints}
              text={summary.savingsRateDeltaPoints === null ? "" : formatPoints(summary.savingsRateDeltaPoints)}
              goodWhenUp
              suffix="vs mes ant."
            />
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <section className="min-w-0 rounded-card border bg-card p-4 lg:col-span-2 lg:p-5" aria-labelledby="trend-title">
          <h2 id="trend-title" className="text-sm font-bold">
            Últimos 12 meses
            <span className="ml-2 text-xs font-medium text-muted-foreground">Balance {OWNER_LABEL[owner]}</span>
          </h2>
          <div className="mt-3">
            <TrendChart
              data={summary.trend.map((m) => ({
                key: ymKey(m.ym),
                label: formatMonthShort(m.ym.year, m.ym.month),
                title: formatMonthTitle(m.ym.year, m.ym.month),
                ingresos: m.income,
                gastos: m.expenses,
                ahorro: m.savings,
              }))}
            />
          </div>
        </section>
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <SupermarketCard data={summary.supermarket} />
          <AmexCard monthSpent={summary.amex.monthSpent} pending={summary.amex.pending} />
        </div>
      </div>

      <section className="rounded-card border bg-card p-4 lg:p-5" aria-labelledby="concepts-title">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="concepts-title" className="text-sm font-bold">
            Gasto por concepto
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              {formatMonthTitle(ym.year, ym.month)}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Total <span className="font-bold text-foreground tabular-nums">{formatAmount(totalSpend)}</span>
          </p>
        </div>
        <ConceptSpend rows={summary.byConcept} total={totalSpend} />
      </section>
    </div>
  );
}
