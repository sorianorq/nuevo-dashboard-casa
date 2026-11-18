import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BalanceRow } from "@/lib/calc/balance";
import { projectLine, proposeFromHistory, round2, type BudgetLine } from "@/lib/calc/budget";
import { addMonths, compareYm, daysInMonth, ymOf, type YearMonth } from "@/lib/months";
import { SECTION_ORDER, type ConceptSection } from "@/lib/labels";
import { getBalance } from "./balance";
import { assertOwner, type DataContext } from "./session";
import { fetchAll } from "./query";

/**
 * Presupuesto del Balance activo (fase 5). Partidas = filas de
 * `monthly_budgets` (owner, year, month, concept_id). El gastado sale de la
 * hoja de Balances (getBalance), así las dos pantallas dan la misma cifra.
 */

export type BudgetConcept = { id: string; name: string; section: ConceptSection; parentName: string | null };

export type BudgetData = {
  lines: BudgetLine[];
  /** Gastado en conceptos de Gastos sin partida este mes. */
  unbudgetedSpent: number;
  /** Conceptos que aún no tienen partida (para «+ Partida»). */
  available: BudgetConcept[];
  /** Partidas del mes anterior que este mes no tiene (para «Copiar mes anterior»). */
  copyable: { conceptId: string; name: string; amount: number }[];
  /** Propuesta con histórico (6 meses cerrados). */
  proposals: { conceptId: string; name: string; section: ConceptSection; amount: number; current: number | null; months: number }[];
  isCurrentMonth: boolean;
  isFuture: boolean;
  /** Días transcurridos del mes en curso. */
  day: number;
};

const elapsedFor = (year: number, current: YearMonth) =>
  year < current.year ? 12 : year > current.year ? 0 : current.month;

function flat(rows: BalanceRow[], parent: string | null = null): (BalanceRow & { parentName: string | null })[] {
  return rows.flatMap((r) => [{ ...r, parentName: parent }, ...flat(r.children, r.name)]);
}

export async function getBudget(ctx: DataContext, ym: YearMonth, today: string): Promise<BudgetData> {
  assertOwner(ctx, ctx.owner);
  const current = ymOf(today);
  const isCurrentMonth = compareYm(ym, current) === 0;
  const isFuture = compareYm(ym, current) > 0;
  const prev = addMonths(ym, -1);
  // Histórico: 6 meses cerrados antes del mes en pantalla (o del actual si es futuro).
  const base = isFuture ? current : ym;
  const history = Array.from({ length: 6 }, (_, i) => addMonths(base, -(i + 1)));
  const years = [...new Set([ym.year, prev.year, ...history.map((h) => h.year)])];
  const sheets = new Map(
    await Promise.all(
      years.map(async (y) => [y, await getBalance(ctx, y, elapsedFor(y, current), { includeArchived: true })] as const),
    ),
  );
  const rowsOf = (y: number) => flat(sheets.get(y)!.blocks.flatMap((b) => b.rows)).filter((r) => r.kind !== "subtotal");

  const rows = rowsOf(ym.year);
  const day = isCurrentMonth ? Number(today.slice(8, 10)) : 0;
  const dim = daysInMonth(ym);
  const m = ym.month - 1;

  const lines: BudgetLine[] = [];
  let unbudgetedSpent = 0;
  for (const r of rows) {
    const budget = r.budget[m];
    const spent = isFuture ? null : (r.real[m] ?? 0);
    if (budget === null) {
      if (r.section === "gastos" && spent) unbudgetedSpent = round2(unbudgetedSpent + spent);
      continue;
    }
    const automatic = r.kind === "linked" && !r.manualOverride[m];
    lines.push({
      conceptId: r.id,
      name: r.name,
      section: r.section,
      parentName: r.parentName,
      linkSource: r.linkSource,
      spent,
      budget,
      forecast: isCurrentMonth && spent !== null ? projectLine(spent, automatic, day, dim) : null,
    });
  }

  const budgeted = new Set(lines.map((l) => l.conceptId));
  const available = rows
    .filter((r) => !r.archived && !budgeted.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, section: r.section, parentName: r.parentName }))
    .sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));

  const prevRows = rowsOf(prev.year);
  const copyable = prevRows
    .filter((r) => !r.archived && r.budget[prev.month - 1] !== null && !budgeted.has(r.id))
    .map((r) => ({ conceptId: r.id, name: r.name, amount: r.budget[prev.month - 1] as number }));

  const byYear = new Map(years.map((y) => [y, new Map(rowsOf(y).map((r) => [r.id, r]))]));
  const proposals: BudgetData["proposals"] = [];
  for (const r of rows) {
    if (r.archived || r.section === "ingresos") continue;
    const values = history.map((h) => byYear.get(h.year)?.get(r.id)?.real[h.month - 1] ?? 0);
    const used = values.filter((v) => v > 0).length;
    const amount = used ? proposeFromHistory(values) : null;
    if (amount === null) continue;
    proposals.push({ conceptId: r.id, name: r.name, section: r.section, amount, current: r.budget[m], months: used });
  }
  proposals.sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || b.amount - a.amount);

  return { lines, unbudgetedSpent, available, copyable, proposals, isCurrentMonth, isFuture, day };
}

// --- Cambios -------------------------------------------------------------

const dbError = (e: { message: string }) => new Error(`Error de base de datos: ${e.message}`);

/** Conceptos del Balance activo que admiten partida (no subtotales). */
async function ownConcepts(ctx: DataContext) {
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase.from("andrea_concepts").select("id, concept, kind").eq("owner", ctx.owner).order("id").range(a, b),
  );
  return new Map(rows.filter((r) => r.kind !== "subtotal").map((r) => [String(r.id), String(r.concept)]));
}

function checkYm(ym: YearMonth, today: string) {
  const current = ymOf(today);
  if (compareYm(ym, addMonths(current, 12)) > 0 || ym.year < 2000) throw new Error("Mes no válido.");
}

/** Pone (o quita, con null) el importe de varias partidas del mes. */
export async function setBudgets(
  ctx: DataContext,
  ym: YearMonth,
  today: string,
  items: { conceptId: string; amount: number | null }[],
  opts: { onlyMissing?: boolean } = {},
): Promise<number> {
  assertOwner(ctx, ctx.owner);
  checkYm(ym, today);
  if (!items.length || items.length > 300) throw new Error("Nada que guardar.");
  const names = await ownConcepts(ctx);
  for (const it of items) {
    if (!names.has(it.conceptId)) throw new Error("Ese concepto no es de este Balance.");
    if (it.amount !== null && (!Number.isFinite(it.amount) || it.amount < 0 || it.amount >= 1e7)) {
      throw new Error("Importe no válido.");
    }
  }
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("monthly_budgets")
    .select("id, concept_id")
    .eq("owner", ctx.owner)
    .eq("year", ym.year)
    .eq("month", ym.month)
    .in("concept_id", items.map((i) => i.conceptId));
  if (error) throw dbError(error);
  const rowsOf = new Map<string, string[]>();
  for (const r of existing ?? []) rowsOf.set(String(r.concept_id), [...(rowsOf.get(String(r.concept_id)) ?? []), String(r.id)]);

  let changed = 0;
  const inserts: Record<string, unknown>[] = [];
  for (const it of items) {
    const ids = rowsOf.get(it.conceptId) ?? [];
    if (opts.onlyMissing && ids.length) continue;
    if (it.amount === null) {
      if (!ids.length) continue;
      const { error: e } = await supabase.from("monthly_budgets").delete().in("id", ids);
      if (e) throw dbError(e);
      changed++;
      continue;
    }
    const amount = round2(it.amount);
    if (ids.length) {
      const { data, error: e } = await supabase.from("monthly_budgets").update({ budget_amount: amount }).eq("id", ids[0]).select("id");
      if (e) throw dbError(e);
      if (!data?.length) throw new Error("Sin permiso para cambiar el presupuesto (falta el script 10).");
      if (ids.length > 1) {
        const { error: e2 } = await supabase.from("monthly_budgets").delete().in("id", ids.slice(1));
        if (e2) throw dbError(e2);
      }
    } else {
      inserts.push({
        owner: ctx.owner,
        year: ym.year,
        month: ym.month,
        concept_id: it.conceptId,
        budget_amount: amount,
        category_group: names.get(it.conceptId),
      });
    }
    changed++;
  }
  if (inserts.length) {
    const { error: e } = await supabase.from("monthly_budgets").insert(inserts);
    if (e) throw dbError(e);
  }
  return changed;
}
