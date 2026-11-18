import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  savingsRateDeltaPoints,
  supermarketSummary,
  round2,
  type MonthFlow,
  type SupermarketSummary,
} from "@/lib/calc/summary";
import type { BalanceRow } from "@/lib/calc/balance";
import { addMonths, monthEnd, monthStart, monthsEndingAt, ymOf, type YearMonth } from "@/lib/months";
import { getBalance, type BalanceData } from "./balance";
import { assertOwner, type DataContext } from "./session";
import { fetchAll, num } from "./query";

export type ConceptSpendRow = {
  conceptId: string | null;
  name: string;
  parentName: string | null;
  amount: number;
  budget: number | null;
};

export type Summary = {
  ym: YearMonth;
  current: MonthFlow;
  previous: MonthFlow;
  savingsRateDeltaPoints: number | null;
  /** 12 meses que terminan en el mes elegido. */
  trend: MonthFlow[];
  byConcept: ConceptSpendRow[];
  supermarket: SupermarketSummary;
  amex: { monthSpent: number; pending: number };
};

/**
 * Datos del Resumen para el Balance del contexto (Casa o persona).
 * Ingresos, gastos, gráfico y gasto por concepto salen de la hoja de
 * Balances («Real»), igual que en Balances (decisión de Ricardo, 18/11/2026;
 * antes: todos los movimientos del banco, tuvieran concepto o no).
 * Ahorro = ingresos − gastos (lo invertido cuenta como ahorro).
 * Supermercado y Amex: compartidos (los ven todos los roles).
 */
export async function getSummary(ctx: DataContext, ym: YearMonth, today: string): Promise<Summary> {
  assertOwner(ctx, ctx.owner);
  const supabase = await createClient();

  const trendMonths = monthsEndingAt(ym, 12);
  const to = monthEnd(ym);
  const superFrom = monthStart(addMonths(ym, -12));

  // Hojas de Balances de los años del gráfico (12 meses: uno o dos años).
  const nowYm = ymOf(today);
  const years = [...new Set(trendMonths.map((m) => m.year))];
  const sheetsPromise = Promise.all(
    years.map((y) => getBalance(ctx, y, y < nowYm.year ? 12 : y === nowYm.year ? nowYm.month : 0)),
  );

  const [sheets, purchases, firstPurchase, amexMonth, amexPending] = await Promise.all([
    sheetsPromise,
    fetchAll((a, b) =>
      supabase
        .from("supermarket_purchases")
        .select("id, purchase_date, total")
        .gte("purchase_date", superFrom)
        .lte("purchase_date", to)
        .order("id")
        .range(a, b),
    ),
    supabase
      .from("supermarket_purchases")
      .select("purchase_date")
      .order("purchase_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    fetchAll((a, b) =>
      supabase
        .from("amex_expenses")
        .select("id, amount")
        .eq("wallet", "amex")
        .gte("expense_date", monthStart(ym))
        .lte("expense_date", to)
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("amex_expenses")
        .select("id, amount")
        .eq("wallet", "amex")
        .eq("pending", true)
        .order("id")
        .range(a, b),
    ),
  ]);
  if (firstPurchase.error) throw new Error(`Error de base de datos: ${firstPurchase.error.message}`);

  const sheetOf = new Map<number, BalanceData>(years.map((y, i) => [y, sheets[i]]));
  const blockReal = (sheet: BalanceData | undefined, section: "ingresos" | "gastos", month: number) =>
    sheet?.blocks.find((bl) => bl.section === section)?.total.real[month - 1] ?? 0;

  const trend: MonthFlow[] = trendMonths.map((m) => {
    const sheet = sheetOf.get(m.year);
    const income = round2(blockReal(sheet, "ingresos", m.month));
    const expenses = round2(blockReal(sheet, "gastos", m.month));
    const savings = round2(income - expenses);
    return { ym: m, income, expenses, savings, savingsRate: income > 0 ? savings / income : null };
  });
  const current = trend[trend.length - 1];
  const previous = trend[trend.length - 2];

  // Gasto por concepto del mes: filas de Gastos de la hoja (con su presupuesto).
  const i = ym.month - 1;
  const gastos = sheetOf.get(ym.year)?.blocks.find((bl) => bl.section === "gastos");
  type Leaf = { row: BalanceRow; parentName: string | null };
  const leaves: Leaf[] = (gastos?.rows ?? []).flatMap((r): Leaf[] =>
    r.kind === "subtotal" ? r.children.map((c) => ({ row: c, parentName: r.name })) : [{ row: r, parentName: null }],
  );
  const byConcept: ConceptSpendRow[] = leaves
    .map(({ row, parentName }) => ({
      conceptId: row.id,
      name: row.name,
      parentName,
      amount: round2(row.real[i] ?? 0),
      budget: row.budget[i],
    }))
    .filter((r) => Math.abs(r.amount) >= 0.005 || r.budget !== null)
    .sort((x, y) => y.amount - x.amount || x.name.localeCompare(y.name, "es"));

  const supermarket = supermarketSummary(
    purchases.map((p) => ({ purchase_date: String(p.purchase_date), total: num(p.total) })),
    ym,
    today,
    firstPurchase.data ? String(firstPurchase.data.purchase_date) : null,
  );

  return {
    ym,
    current,
    previous,
    savingsRateDeltaPoints: savingsRateDeltaPoints(current, previous),
    trend,
    byConcept,
    supermarket,
    amex: {
      monthSpent: round2(amexMonth.reduce((s, r) => s + num(r.amount), 0)),
      pending: round2(amexPending.reduce((s, r) => s + num(r.amount), 0)),
    },
  };
}
