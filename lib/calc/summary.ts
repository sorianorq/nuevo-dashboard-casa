/**
 * Reglas de cálculo del Resumen (especificación, apartado 6). Funciones puras:
 * reciben filas ya filtradas por lib/data/ y no acceden a la base de datos.
 */
import {
  addMonths,
  compareYm,
  daysInMonth,
  monthEnd,
  monthsEndingAt,
  ymKey,
  ymOf,
  type YearMonth,
} from "@/lib/months";

/** Movimiento con flow = 'normal' (los demás no deben llegar aquí). */
export type TxRow = { transaction_date: string; amount: number; concept_id: string | null };
export type PurchaseRow = { purchase_date: string; total: number };

export type MonthFlow = {
  ym: YearMonth;
  income: number;
  expenses: number; // positivo
  savings: number;
  /** Ahorro / ingresos; null si no hay ingresos. */
  savingsRate: number | null;
};

/** Ingresos (amount > 0) y gastos (amount < 0) por mes. */
export function monthlyFlows(rows: TxRow[], months: YearMonth[]): MonthFlow[] {
  const acc = new Map(months.map((m) => [ymKey(m), { income: 0, expenses: 0 }]));
  for (const r of rows) {
    const bucket = acc.get(r.transaction_date.slice(0, 7));
    if (!bucket) continue;
    if (r.amount > 0) bucket.income += r.amount;
    else if (r.amount < 0) bucket.expenses += -r.amount;
  }
  return months.map((ym) => {
    const { income, expenses } = acc.get(ymKey(ym))!;
    const inc = round2(income);
    const exp = round2(expenses);
    const savings = round2(inc - exp);
    return { ym, income: inc, expenses: exp, savings, savingsRate: inc > 0 ? savings / inc : null };
  });
}

/**
 * Acumulado del año hasta el mes elegido (enero..mes), con las mismas reglas
 * que cada mes. `flows` debe incluir esos meses (la tendencia de 12 meses
 * que acaba en el mes elegido siempre los tiene).
 */
export function yearToDate(flows: MonthFlow[], ym: YearMonth): Omit<MonthFlow, "ym"> {
  const months = flows.filter((f) => f.ym.year === ym.year && f.ym.month <= ym.month);
  const income = round2(months.reduce((s, f) => s + f.income, 0));
  const expenses = round2(months.reduce((s, f) => s + f.expenses, 0));
  const savings = round2(income - expenses);
  return { income, expenses, savings, savingsRate: income > 0 ? savings / income : null };
}

/** Variación de la tasa de ahorro en puntos porcentuales; null si falta alguna tasa. */
export function savingsRateDeltaPoints(current: MonthFlow, previous: MonthFlow): number | null {
  if (current.savingsRate === null || previous.savingsRate === null) return null;
  return (current.savingsRate - previous.savingsRate) * 100;
}

export type ConceptSpend = {
  conceptId: string | null;
  amount: number; // gasto positivo
  budget: number | null;
};

/** Gasto del mes por concepto (solo amount < 0), de mayor a menor. */
export function spendByConcept(
  rows: TxRow[],
  ym: YearMonth,
  budgets: Map<string, number>,
): ConceptSpend[] {
  const key = ymKey(ym);
  const acc = new Map<string | null, number>();
  for (const r of rows) {
    if (r.amount >= 0 || r.transaction_date.slice(0, 7) !== key) continue;
    acc.set(r.concept_id, (acc.get(r.concept_id) ?? 0) - r.amount);
  }
  // Conceptos con presupuesto pero sin gasto también se muestran.
  for (const id of budgets.keys()) if (!acc.has(id)) acc.set(id, 0);

  return [...acc.entries()]
    .map(([conceptId, amount]) => ({
      conceptId,
      amount: round2(amount),
      budget: conceptId ? (budgets.get(conceptId) ?? null) : null,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type SupermarketSummary = {
  spent: number;
  /** Gasto comparable del mes anterior (ver regla) y hasta qué fecha se cuenta. */
  previousComparable: number;
  previousCutoff: string;
  /** spent / previousComparable − 1; null si el mes anterior es 0. */
  vsPrevious: number | null;
  /** Media de los 12 meses cerrados anteriores (proporcional en mes en curso). */
  reference: number | null;
  monthsInAverage: number;
  deviation: number | null;
  deviationRatio: number | null;
  /** Totales de los 12 meses que terminan en el mes elegido. */
  spark: { ym: YearMonth; total: number }[];
  isCurrentMonth: boolean;
};

/**
 * Supermercado:
 * - % vs mes anterior. Mes en curso: del día 1 a hoy frente al mes anterior
 *   del día 1 hasta la primera fecha de compra igual o posterior al día de hoy
 *   (si no hay, mes completo). Mes cerrado: completo frente a completo.
 * - Desvío frente a la media de los 12 meses cerrados anteriores; en mes en
 *   curso, frente a la media proporcional a los días transcurridos.
 *   Solo cuentan los meses desde la primera compra registrada, para que un
 *   historial más corto de 12 meses no rebaje la media con ceros.
 */
export function supermarketSummary(
  purchases: PurchaseRow[],
  ym: YearMonth,
  today: string,
  firstPurchaseDate: string | null,
): SupermarketSummary {
  const isCurrentMonth = compareYm(ym, ymOf(today)) === 0;
  const key = ymKey(ym);
  const prev = addMonths(ym, -1);
  const prevKey = ymKey(prev);

  const byMonth = new Map<string, number>();
  for (const p of purchases) {
    const k = p.purchase_date.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + p.total);
  }

  const spent = round2(
    purchases
      .filter((p) => p.purchase_date.startsWith(key) && (!isCurrentMonth || p.purchase_date <= today))
      .reduce((s, p) => s + p.total, 0),
  );

  let previousCutoff = monthEnd(prev);
  if (isCurrentMonth) {
    const todayDay = Number(today.slice(8, 10));
    const candidate = purchases
      .filter((p) => p.purchase_date.startsWith(prevKey) && Number(p.purchase_date.slice(8, 10)) >= todayDay)
      .map((p) => p.purchase_date)
      .sort()[0];
    if (candidate) previousCutoff = candidate;
  }
  const previousComparable = round2(
    purchases
      .filter((p) => p.purchase_date.startsWith(prevKey) && p.purchase_date <= previousCutoff)
      .reduce((s, p) => s + p.total, 0),
  );
  const vsPrevious = previousComparable > 0 ? spent / previousComparable - 1 : null;

  const closed = monthsEndingAt(prev, 12).filter(
    (m) => firstPurchaseDate !== null && monthEnd(m) >= firstPurchaseDate,
  );
  let reference: number | null = null;
  if (closed.length > 0) {
    const avg = closed.reduce((s, m) => s + (byMonth.get(ymKey(m)) ?? 0), 0) / closed.length;
    const factor = isCurrentMonth ? Number(today.slice(8, 10)) / daysInMonth(ym) : 1;
    reference = round2(avg * factor);
  }
  const deviation = reference === null ? null : round2(spent - reference);
  const deviationRatio = reference && reference > 0 ? spent / reference - 1 : null;

  const spark = monthsEndingAt(ym, 12).map((m) => ({
    ym: m,
    total: round2(
      compareYm(m, ym) === 0 ? spent : (byMonth.get(ymKey(m)) ?? 0),
    ),
  }));

  return {
    spent,
    previousComparable,
    previousCutoff,
    vsPrevious,
    reference,
    monthsInAverage: closed.length,
    deviation,
    deviationRatio,
    spark,
    isCurrentMonth,
  };
}

/** Redondeo a céntimos para evitar arrastres de coma flotante. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
