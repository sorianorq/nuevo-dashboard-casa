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
import { SectionIcon, StatCard } from "./stat-card";
import { AnimatedNumber } from "./animated-number";
import { ArrowDownToLine, ArrowUpFromLine, ChartColumnBig, Gauge, LayoutList, PiggyBank } from "lucide-react";
import { SupermarketCard } from "./supermarket-card";
import { TrendChart } from "./trend-chart";
import { MiniBars } from "./mini-bars";
import { MoneySplit } from "./money-split";
import { BudgetPace } from "./budget-pace";

export type ResumenBudget = {
  spent: number;
  budget: number;
  invested: number;
  investBudget: number;
  day: number | null;
  daysInMonth: number;
  href: string;
};

/**
 * Resumen (especificación, apartado 7). Solo presentación.
 * Ordenador: 4 tarjetas en fila · gráfico ⅔ + Supermercado/Amex ⅓ ·
 * categorías en 2 columnas.
 */
export function ResumenView({ summary, owner, budget }: { summary: Summary; owner: Owner; budget: ResumenBudget }) {
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

  const spark = (pick: (m: Summary["trend"][number]) => number | null) =>
    summary.trend.map((m) => ({ title: formatMonthTitle(m.ym.year, m.ym.month), value: pick(m) }));
  const sparkLabel = (what: string) => `${what} de los últimos 12 meses; el último es ${formatMonthTitle(ym.year, ym.month)}.`;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          float
          icon={ArrowDownToLine}
          tone="var(--series-income)"
          label="Ingresos"
          value={<AnimatedNumber value={current.income} kind="amount" />}
          note={ytdNote(formatAmount(ytd.income))}
          spark={<MiniBars points={spark((m) => m.income)} color="var(--series-income)" label={sparkLabel("Ingresos")} format={formatAmount} />}
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
          float
          icon={ArrowUpFromLine}
          tone="var(--series-expense)"
          label="Gastos"
          value={<AnimatedNumber value={current.expenses} kind="amount" />}
          note={ytdNote(formatAmount(ytd.expenses))}
          spark={<MiniBars points={spark((m) => m.expenses)} color="var(--series-expense)" label={sparkLabel("Gastos")} format={formatAmount} />}
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
          float
          icon={PiggyBank}
          tone="var(--series-savings)"
          label="Ahorro"
          value={<AnimatedNumber value={current.savings} kind="amount" />}
          note={ytdNote(formatAmount(ytd.savings), ytd.savings < 0 ? "font-bold text-warning" : undefined)}
          valueClassName={current.savings < 0 ? "text-warning" : undefined}
          spark={<MiniBars points={spark((m) => m.savings)} color="var(--series-savings)" label={sparkLabel("Ahorro")} format={formatAmount} />}
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
          float
          icon={Gauge}
          tone="var(--series-savings)"
          label="Tasa de ahorro"
          value={current.savingsRate === null ? "—" : <AnimatedNumber value={current.savingsRate} kind="percent" />}
          note={ytdNote(ytd.savingsRate === null ? "—" : formatPercent(ytd.savingsRate))}
          spark={
            <MiniBars
              points={spark((m) => m.savingsRate)}
              color="var(--series-savings)"
              label={sparkLabel("Tasa de ahorro")}
              format={formatPercent}
            />
          }
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
        <div className="min-w-0 lg:col-span-2">
          <MoneySplit income={current.income} expenses={current.expenses} monthLabel={formatMonthTitle(ym.year, ym.month)} />
        </div>
        <div className="min-w-0">
          <BudgetPace {...budget} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <section className="fc-float min-w-0 p-4 lg:col-span-2 lg:p-5" aria-labelledby="trend-title">
          <h2 id="trend-title" className="flex items-center gap-2 text-sm font-bold">
            <SectionIcon icon={ChartColumnBig} tone="var(--series-income)" />
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

      <section className="fc-float p-4 lg:p-5" aria-labelledby="concepts-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="concepts-title" className="flex items-center gap-2 text-sm font-bold">
            <SectionIcon icon={LayoutList} tone="var(--series-expense)" />
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
