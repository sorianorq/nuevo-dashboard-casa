import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  monthlyFlows,
  savingsRateDeltaPoints,
  spendByConcept,
  supermarketSummary,
  round2,
  type MonthFlow,
  type SupermarketSummary,
} from "@/lib/calc/summary";
import { addMonths, monthEnd, monthStart, monthsEndingAt, type YearMonth } from "@/lib/months";
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
 * Ingresos/gastos: transactions con flow='normal' del Balance.
 * Supermercado y Amex: compartidos (los ven todos los roles).
 */
export async function getSummary(ctx: DataContext, ym: YearMonth, today: string): Promise<Summary> {
  assertOwner(ctx, ctx.owner);
  const supabase = await createClient();

  const trendMonths = monthsEndingAt(ym, 12);
  const from = monthStart(trendMonths[0]);
  const to = monthEnd(ym);
  const superFrom = monthStart(addMonths(ym, -12));

  const [tx, concepts, budgets, purchases, firstPurchase, amexMonth, amexPending] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("transactions")
        .select("id, transaction_date, amount, concept_id")
        .eq("owner", ctx.owner)
        .eq("flow", "normal")
        .gte("transaction_date", from)
        .lte("transaction_date", to)
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("andrea_concepts")
        .select("id, concept, parent_id")
        .eq("owner", ctx.owner)
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("monthly_budgets")
        .select("id, concept_id, budget_amount")
        .eq("owner", ctx.owner)
        .eq("year", ym.year)
        .eq("month", ym.month)
        .order("id")
        .range(a, b),
    ),
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

  const txRows = tx.map((r) => ({
    transaction_date: String(r.transaction_date),
    amount: num(r.amount),
    concept_id: (r.concept_id as string | null) ?? null,
  }));

  const trend = monthlyFlows(txRows, trendMonths);
  const current = trend[trend.length - 1];
  const previous = trend[trend.length - 2];

  const budgetMap = new Map<string, number>();
  for (const b of budgets) {
    if (b.concept_id) budgetMap.set(String(b.concept_id), num(b.budget_amount));
  }

  const conceptById = new Map(
    concepts.map((c) => [String(c.id), { name: String(c.concept), parentId: (c.parent_id as string | null) ?? null }]),
  );
  const byConcept = spendByConcept(txRows, ym, budgetMap).map((row) => {
    const concept = row.conceptId ? conceptById.get(row.conceptId) : undefined;
    const parent = concept?.parentId ? conceptById.get(concept.parentId) : undefined;
    return {
      ...row,
      name: row.conceptId ? (concept?.name ?? "Concepto desconocido") : "Sin concepto",
      parentName: parent?.name ?? null,
    };
  });

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
