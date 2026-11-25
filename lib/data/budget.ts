import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BalanceRow } from "@/lib/calc/balance";
import { proposeFromHistory, round2, type BudgetLine } from "@/lib/calc/budget";
import { addMonths, compareYm, ymOf, type YearMonth } from "@/lib/months";
import { getBalance } from "./balance";
import { assertOwner, type DataContext } from "./session";
import { fetchAll } from "./query";

/**
 * Presupuesto del Balance activo: un importe fijo al mes por concepto
 * (andrea_concepts.monthly_budget, script 13), igual para todos los meses.
 * El gastado sale de la hoja de Balances (getBalance), así las dos pantallas
 * dan la misma cifra. Solo Gastos e Inversión (los ingresos no se presupuestan).
 */

export type BudgetData = {
  /** Todos los conceptos de Gastos e Inversión del Balance, en el orden de Balances. */
  lines: BudgetLine[];
  isCurrentMonth: boolean;
  /** Día del mes en curso (0 si es un mes cerrado). */
  day: number;
  /**
   * Base para los %: la nómina real del mes (concepto «Nómina» de Ingresos; en
   * Casa, la de Ricardo) o, si el Balance no tiene nómina, el total de ingresos.
   * null = no se puede calcular (p. ej. Andrea viendo Casa).
   */
  income: { label: string; amount: number | null } | null;
};

const isNomina = (name: string) => /n[oó]mina/i.test(name);

const elapsedFor = (year: number, current: YearMonth) =>
  year < current.year ? 12 : year > current.year ? 0 : current.month;

function flat(rows: BalanceRow[], parent: string | null = null): (BalanceRow & { parentName: string | null })[] {
  return rows.flatMap((r) => [{ ...r, parentName: parent }, ...flat(r.children, r.name)]);
}

export async function getBudget(ctx: DataContext, ym: YearMonth, today: string): Promise<BudgetData> {
  assertOwner(ctx, ctx.owner);
  const current = ymOf(today);
  const isCurrentMonth = compareYm(ym, current) === 0;
  // Media de los 6 meses cerrados anteriores al mes en pantalla (para «Usar la media»).
  const history = Array.from({ length: 6 }, (_, i) => addMonths(isCurrentMonth ? current : ym, -(i + 1)));
  const years = [...new Set([ym.year, ...history.map((h) => h.year)])];
  const sheets = new Map(
    await Promise.all(
      years.map(async (y) => [y, await getBalance(ctx, y, elapsedFor(y, current), { includeArchived: true })] as const),
    ),
  );
  const rowsOf = (y: number) =>
    flat(sheets.get(y)!.blocks.flatMap((b) => b.rows)).filter((r) => r.kind !== "subtotal" && r.section !== "ingresos");
  const byYear = new Map(years.map((y) => [y, new Map(rowsOf(y).map((r) => [r.id, r]))]));
  const m = ym.month - 1;

  const lines: BudgetLine[] = [];
  for (const r of rowsOf(ym.year)) {
    const budget = r.budget[m];
    const spent = r.real[m] ?? 0;
    // Los archivados solo se ven si aún tienen presupuesto o gasto ese mes.
    if (r.archived && budget === null && !spent) continue;
    const values = history.map((h) => byYear.get(h.year)?.get(r.id)?.real[h.month - 1] ?? 0);
    lines.push({
      conceptId: r.id,
      name: r.name,
      section: r.section,
      parentName: r.parentName,
      spent: round2(spent),
      budget,
      average: values.some((v) => v > 0) ? proposeFromHistory(values) : null,
      archived: r.archived,
    });
  }

  // Nómina del mes.
  const incomeRows = (rows: BalanceRow[]) =>
    flat(rows).filter((r) => r.kind !== "subtotal" && r.section === "ingresos");
  let income: BudgetData["income"] = null;
  const sumOf = (rows: BalanceRow[]) => {
    const vals = rows.map((r) => r.real[m]).filter((v): v is number => v !== null);
    return vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null;
  };
  const own = incomeRows(sheets.get(ym.year)!.blocks.flatMap((b) => b.rows));
  if (own.some((r) => isNomina(r.name))) {
    income = { label: "Nómina", amount: sumOf(own.filter((r) => isNomina(r.name))) };
  } else if (ctx.owner === "casa") {
    // Casa no cobra nómina: se usa la de Ricardo (si quien mira puede ver su Balance).
    if (ctx.allowedOwners.includes("ricardo")) {
      const ric = await getBalance({ ...ctx, owner: "ricardo" }, ym.year, elapsedFor(ym.year, current), { includeArchived: true });
      const rows = incomeRows(ric.blocks.flatMap((b) => b.rows)).filter((r) => isNomina(r.name));
      if (rows.length) income = { label: "Nómina de Ricardo", amount: sumOf(rows) };
    }
  } else {
    income = { label: "Ingresos", amount: sumOf(own) };
  }
  if (income && (income.amount === null || income.amount <= 0)) income = { ...income, amount: null };

  return { lines, isCurrentMonth, day: isCurrentMonth ? Number(today.slice(8, 10)) : 0, income };
}

// --- Cambios -------------------------------------------------------------

const dbError = (e: { message: string }) => new Error(`Error de base de datos: ${e.message}`);

/**
 * Pone (o quita, con null) el presupuesto fijo al mes de varios conceptos del
 * Balance activo. Admite también Ingresos (se editan desde Balances).
 */
export async function setBudgets(ctx: DataContext, items: { conceptId: string; amount: number | null }[]): Promise<number> {
  assertOwner(ctx, ctx.owner);
  if (!items.length || items.length > 300) throw new Error("Nada que guardar.");
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase.from("andrea_concepts").select("id, kind, monthly_budget").eq("owner", ctx.owner).order("id").range(a, b),
  );
  const own = new Map(rows.filter((r) => r.kind !== "subtotal").map((r) => [String(r.id), r]));

  let changed = 0;
  for (const it of items) {
    const row = own.get(it.conceptId);
    if (!row) throw new Error("Ese concepto no es de este Balance.");
    if (it.amount !== null && (!Number.isFinite(it.amount) || it.amount < 0 || it.amount >= 1e7)) {
      throw new Error("Importe no válido.");
    }
    const amount = it.amount === null ? null : round2(it.amount);
    const before = row.monthly_budget === null || row.monthly_budget === undefined ? null : round2(Number(row.monthly_budget));
    if (amount === before) continue;
    const { data, error } = await supabase
      .from("andrea_concepts")
      .update({ monthly_budget: amount })
      .eq("id", it.conceptId)
      .eq("owner", ctx.owner)
      .select("id");
    if (error) {
      if (/monthly_budget/.test(error.message)) throw new Error("Falta ejecutar el script 13 (presupuesto fijo).");
      throw dbError(error);
    }
    if (!data?.length) throw new Error("Sin permiso para cambiar el presupuesto de este Balance.");
    changed++;
  }
  return changed;
}
