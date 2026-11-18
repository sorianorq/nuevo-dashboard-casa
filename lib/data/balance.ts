import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  MONTHS,
  buildBalanceSheet,
  movementInSection,
  round2,
  type BalanceConcept,
  type BalanceSheet,
  type ConceptKind,
  type LinkSource,
  type MonthValues,
} from "@/lib/calc/balance";
import { SECTION_ORDER, type ConceptSection } from "@/lib/labels";
import { assertOwner, type DataContext } from "./session";
import { fetchAll, num } from "./query";
import { getHiddenConcepts } from "./balance-edit";

export type BalanceData = BalanceSheet & {
  year: number;
  /** Comentarios por concepto: doce textos (enero..diciembre) o null. */
  comments: Record<string, (string | null)[]>;
  /** Conceptos que este usuario ha ocultado (siguen sumando). */
  hidden: string[];
  /** Importes manuales del año cuyo concepto no está en el catálogo (no suman). */
  orphanManual: { concept: string; total: number }[];
};

const KINDS: ConceptKind[] = ["manual", "linked", "subtotal"];
const SOURCES: LinkSource[] = ["movimientos", "pagos", "supermercado"];

/**
 * Hoja anual del Balance activo (`ctx.owner`). Reglas en lib/calc/balance.ts.
 *
 * Origen de cada concepto enlazado (decisión de Ricardo, 18/11/2026):
 * - movimientos → `transactions` del Balance con `flow = 'normal'`;
 * - Pagos y Amex (`amex_expenses`) con concepto suman en ese concepto enlazado
 *   SEA CUAL SEA su origen (decisión de Ricardo, 18/11/2026: al apuntar un gasto
 *   en Pagos se marca «AMEX» y se elige el concepto). No hay doble conteo: el
 *   cargo de la tarjeta en el banco es `card_settlement` y no suma. Se excluyen
 *   las que vienen de una compra de Supermercado, que ya cuentan en su
 *   concepto de Supermercado;
 * - supermercado → `supermarket_purchases` con ese concepto; las compras sin
 *   concepto van a «Compra» de Casa (el concepto de Casa con ese origen).
 */
export async function getBalance(
  ctx: DataContext,
  year: number,
  monthsElapsed: number,
  opts: { includeArchived?: boolean } = {},
): Promise<BalanceData> {
  assertOwner(ctx, ctx.owner);
  const supabase = await createClient();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const conceptRows = await fetchAll((a, b) =>
    supabase
      .from("andrea_concepts")
      .select("id, concept, section, kind, parent_id, link_source, sort_order, archived, periodicity")
      .eq("owner", ctx.owner)
      .order("id")
      .range(a, b),
  );
  const concepts: BalanceConcept[] = conceptRows.map((r) => ({
    id: String(r.id),
    name: String(r.concept),
    section: (SECTION_ORDER.includes(r.section) ? r.section : "gastos") as ConceptSection,
    kind: (KINDS.includes(r.kind) ? r.kind : "manual") as ConceptKind,
    parentId: r.parent_id ? String(r.parent_id) : null,
    linkSource: SOURCES.includes(r.link_source) ? (r.link_source as LinkSource) : null,
    sortOrder: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 9999,
    archived: Boolean(r.archived),
    periodicity: typeof r.periodicity === "string" && r.periodicity.trim() ? r.periodicity.trim() : null,
  }));
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const linkedBy = (source: LinkSource) =>
    concepts.filter((c) => c.kind === "linked" && c.linkSource === source).map((c) => c.id);
  const pagosIds = concepts.filter((c) => c.kind === "linked").map((c) => c.id);
  const superIds = linkedBy("supermercado");
  // Compras sin concepto → «Compra» de Casa (especificación funcional, 5.5).
  const defaultSuper = ctx.owner === "casa" && superIds.length === 1 ? superIds[0] : null;

  const [tx, pagos, compras, manualRows, budgetRows, commentRows, periodicityRows, hidden] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("transactions")
        .select("id, transaction_date, amount, concept_id")
        .eq("owner", ctx.owner)
        .eq("flow", "normal")
        .not("concept_id", "is", null)
        .gte("transaction_date", from)
        .lte("transaction_date", to)
        .order("id")
        .range(a, b),
    ),
    pagosIds.length
      ? fetchAll((a, b) =>
          supabase
            .from("amex_expenses")
            .select("id, expense_date, amount, concept_id")
            .in("concept_id", pagosIds)
            .is("purchase_id", null)
            .gte("expense_date", from)
            .lte("expense_date", to)
            .order("id")
            .range(a, b),
        )
      : Promise.resolve([]),
    superIds.length
      ? fetchAll((a, b) =>
          supabase
            .from("supermarket_purchases")
            .select("id, purchase_date, total, concept_id")
            .gte("purchase_date", from)
            .lte("purchase_date", to)
            .order("id")
            .range(a, b),
        )
      : Promise.resolve([]),
    fetchAll((a, b) =>
      supabase
        .from("andrea_balance")
        .select("id, month, concept, concept_id, amount")
        .eq("owner", ctx.owner)
        .eq("year", year)
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("monthly_budgets")
        .select("id, month, concept_id, budget_amount")
        .eq("owner", ctx.owner)
        .eq("year", year)
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("andrea_comments")
        .select("id, month, concept, concept_id, comment")
        .eq("owner", ctx.owner)
        .eq("year", year)
        .order("id")
        .range(a, b),
    ),
    // Periodicidad antigua (por nombre): solo si el concepto no tiene la suya.
    fetchAll((a, b) =>
      supabase
        .from("andrea_periodicity")
        .select("id, concept, concept_id, periodicity")
        .eq("owner", ctx.owner)
        .order("id")
        .range(a, b),
    ),
    getHiddenConcepts(ctx),
  ]);

  const linked = new Map<string, number[]>();
  const addLinked = (conceptId: string, isoDate: string, value: number) => {
    const month = Number(isoDate.slice(5, 7));
    if (!(month >= 1 && month <= MONTHS)) return;
    const arr = linked.get(conceptId) ?? Array.from({ length: MONTHS }, () => 0);
    arr[month - 1] = round2(arr[month - 1] + value);
    linked.set(conceptId, arr);
  };

  for (const r of tx) {
    const c = byId.get(String(r.concept_id));
    if (c?.kind === "linked" && c.linkSource === "movimientos") {
      addLinked(c.id, String(r.transaction_date), movementInSection(num(r.amount), c.section));
    }
  }
  for (const r of pagos) {
    // amex_expenses.amount es positivo = gasto.
    addLinked(String(r.concept_id), String(r.expense_date), num(r.amount));
  }
  for (const r of compras) {
    const id = r.concept_id ? String(r.concept_id) : defaultSuper;
    if (id && superIds.includes(id)) addLinked(id, String(r.purchase_date), num(r.total));
  }

  // Importes manuales y comentarios: por concept_id o, si falta, por nombre.
  const idByName = new Map(concepts.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const conceptIdOf = (r: { concept_id?: unknown; concept?: unknown }) =>
    (r.concept_id && byId.has(String(r.concept_id)) ? String(r.concept_id) : null) ??
    idByName.get(String(r.concept ?? "").trim().toLowerCase()) ??
    null;

  for (const r of periodicityRows) {
    const id = conceptIdOf(r);
    const c = id ? byId.get(id) : undefined;
    if (c && !c.periodicity && typeof r.periodicity === "string" && r.periodicity.trim()) c.periodicity = r.periodicity.trim();
  }

  const comments: Record<string, (string | null)[]> = {};
  for (const r of commentRows) {
    const id = conceptIdOf(r);
    const month = Number(r.month);
    const text = typeof r.comment === "string" ? r.comment.trim() : "";
    if (!id || !text || !(month >= 1 && month <= MONTHS)) continue;
    comments[id] ??= Array.from({ length: MONTHS }, () => null);
    comments[id][month - 1] = text;
  }
  const manual = new Map<string, MonthValues>();
  const orphans = new Map<string, number>();
  for (const r of manualRows) {
    const month = Number(r.month);
    if (!(month >= 1 && month <= MONTHS)) continue;
    const id = conceptIdOf(r);
    if (!id) {
      const name = String(r.concept ?? "(sin nombre)");
      orphans.set(name, round2((orphans.get(name) ?? 0) + num(r.amount)));
      continue;
    }
    const arr = manual.get(id) ?? Array.from({ length: MONTHS }, () => null);
    // Una celda = un importe (como en la versión anterior, el último manda).
    arr[month - 1] = round2(num(r.amount));
    manual.set(id, arr);
  }

  const budget = new Map<string, MonthValues>();
  for (const r of budgetRows) {
    const month = Number(r.month);
    const id = String(r.concept_id ?? "");
    if (!byId.has(id) || !(month >= 1 && month <= MONTHS)) continue;
    const arr = budget.get(id) ?? Array.from({ length: MONTHS }, () => null);
    arr[month - 1] = round2((arr[month - 1] ?? 0) + num(r.budget_amount));
    budget.set(id, arr);
  }

  const sheet = buildBalanceSheet({ concepts, linked, manual, budget, monthsElapsed, includeArchived: opts.includeArchived });
  return {
    ...sheet,
    year,
    comments,
    hidden: hidden.filter((id) => byId.has(id)),
    orphanManual: [...orphans].map(([concept, total]) => ({ concept, total })),
  };
}
