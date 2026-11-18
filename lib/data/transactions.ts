import "server-only";
import { createClient } from "@/lib/supabase/server";
import { monthEnd, monthStart, type YearMonth } from "@/lib/months";
import { similarityKey, tokens } from "@/lib/import/normalize";
import type { HistoryRow } from "@/lib/import/suggest";
import { assertOwner, type DataContext } from "./session";
import { conceptBelongsTo } from "./concepts";
import { fetchAll, num } from "./query";

import { isFlow, type Flow, type Transaction, type TxType } from "@/lib/labels";

export type { Flow, Transaction, TxType };

export type TxFilters = {
  ym: YearMonth;
  accountId?: string;
  /** id de concepto o "sin" (sin concepto). */
  concept?: string;
  type?: TxType;
  q?: string;
};

const TX_COLUMNS = "id, transaction_date, description, amount, account_id, concept_id, flow, note";

function toTx(r: Record<string, unknown>): Transaction {
  return {
    id: String(r.id),
    date: String(r.transaction_date),
    description: String(r.description ?? ""),
    amount: num(r.amount),
    accountId: r.account_id ? String(r.account_id) : null,
    conceptId: r.concept_id ? String(r.concept_id) : null,
    flow: isFlow(r.flow) ? r.flow : "normal",
    note: r.note ? String(r.note) : null,
  };
}

/** Escapa comodines de LIKE en el texto de búsqueda. */
function likeValue(q: string) {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/** Movimientos del Balance activo con filtros (mes obligatorio). */
export async function listTransactions(ctx: DataContext, f: TxFilters): Promise<Transaction[]> {
  assertOwner(ctx, ctx.owner);
  const supabase = await createClient();
  const rows = await fetchAll((a, b) => {
    let q = supabase
      .from("transactions")
      .select(TX_COLUMNS)
      .eq("owner", ctx.owner)
      .gte("transaction_date", monthStart(f.ym))
      .lte("transaction_date", monthEnd(f.ym));
    if (f.accountId) q = q.eq("account_id", f.accountId);
    if (f.concept === "sin") q = q.is("concept_id", null);
    else if (f.concept) q = q.eq("concept_id", f.concept);
    if (f.type === "ingreso") q = q.eq("flow", "normal").gt("amount", 0);
    if (f.type === "gasto") q = q.eq("flow", "normal").lt("amount", 0);
    if (f.type === "no-cuenta") q = q.neq("flow", "normal");
    if (f.q?.trim()) q = q.ilike("description", likeValue(f.q.trim()));
    return q.order("transaction_date", { ascending: false }).order("id").range(a, b);
  });
  return rows.map(toTx);
}

/** Movimientos que cuentan (flow normal) sin concepto, en todo el histórico. */
export async function countWithoutConcept(ctx: DataContext): Promise<number> {
  assertOwner(ctx, ctx.owner);
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("owner", ctx.owner)
    .eq("flow", "normal")
    .is("concept_id", null);
  if (error) throw new Error(`Error de base de datos: ${error.message}`);
  return count ?? 0;
}

/** Siguiente movimiento sin concepto (más reciente primero), saltando `skip`. */
export async function nextWithoutConcept(ctx: DataContext, skip: number): Promise<Transaction | null> {
  assertOwner(ctx, ctx.owner);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .eq("owner", ctx.owner)
    .eq("flow", "normal")
    .is("concept_id", null)
    .order("transaction_date", { ascending: false })
    .order("id")
    .range(skip, skip);
  if (error) throw new Error(`Error de base de datos: ${error.message}`);
  return data?.[0] ? toTx(data[0]) : null;
}

/** Cambia el concepto de un movimiento del Balance activo. */
export async function setTransactionConcept(
  ctx: DataContext,
  id: string,
  conceptId: string | null,
): Promise<Transaction> {
  assertOwner(ctx, ctx.owner);
  if (conceptId && !(await conceptBelongsTo(ctx, conceptId, ctx.owner))) {
    throw new Error("El concepto no pertenece a este Balance.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .update({ concept_id: conceptId })
    .eq("id", id)
    .eq("owner", ctx.owner)
    .select(TX_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`No se pudo guardar: ${error.message}`);
  if (!data) throw new Error("Movimiento no encontrado en este Balance.");
  return toTx(data);
}

export async function setTransactionFlow(ctx: DataContext, id: string, flow: Flow) {
  assertOwner(ctx, ctx.owner);
  if (!isFlow(flow)) throw new Error("Tipo de flujo no válido.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .update({ flow })
    .eq("id", id)
    .eq("owner", ctx.owner)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`No se pudo guardar: ${error.message}`);
  if (!data) throw new Error("Movimiento no encontrado en este Balance.");
}

/**
 * Movimientos parecidos del mismo Balance (misma descripción sin cifras ni
 * signos) que cuentan y tienen otro concepto.
 */
export async function findSimilar(
  ctx: DataContext,
  source: Pick<Transaction, "id" | "description">,
  conceptId: string | null,
): Promise<Pick<Transaction, "id" | "date" | "description" | "amount">[]> {
  assertOwner(ctx, ctx.owner);
  const key = similarityKey(source.description);
  if (!key) return [];
  // Acota la consulta por la palabra más larga; el filtro exacto va en memoria.
  const longest = tokens(source.description).sort((a, b) => b.length - a.length)[0];
  const supabase = await createClient();
  const rows = await fetchAll((a, b) => {
    let q = supabase
      .from("transactions")
      .select("id, transaction_date, description, amount, concept_id")
      .eq("owner", ctx.owner)
      .eq("flow", "normal")
      .neq("id", source.id);
    if (longest) q = q.ilike("description", likeValue(longest));
    return q.order("transaction_date", { ascending: false }).order("id").range(a, b);
  });
  return rows
    .filter((r) => (r.concept_id ? String(r.concept_id) : null) !== conceptId)
    .filter((r) => similarityKey(String(r.description ?? "")) === key)
    .map((r) => ({
      id: String(r.id),
      date: String(r.transaction_date),
      description: String(r.description ?? ""),
      amount: num(r.amount),
    }));
}

/** Asigna un concepto a varios movimientos del Balance activo. */
export async function applyConceptToMany(ctx: DataContext, ids: string[], conceptId: string | null) {
  assertOwner(ctx, ctx.owner);
  if (conceptId && !(await conceptBelongsTo(ctx, conceptId, ctx.owner))) {
    throw new Error("El concepto no pertenece a este Balance.");
  }
  const supabase = await createClient();
  let updated = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("transactions")
      .update({ concept_id: conceptId })
      .in("id", ids.slice(i, i + 100))
      .eq("owner", ctx.owner)
      .eq("flow", "normal")
      .select("id");
    if (error) throw new Error(`No se pudo guardar: ${error.message}`);
    updated += data?.length ?? 0;
  }
  return updated;
}

/** Historial con concepto del Balance (para sugerir conceptos al importar). */
export async function conceptHistory(ctx: DataContext): Promise<HistoryRow[]> {
  assertOwner(ctx, ctx.owner);
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase
      .from("transactions")
      .select("id, transaction_date, description, concept_id")
      .eq("owner", ctx.owner)
      .eq("flow", "normal")
      .not("concept_id", "is", null)
      .order("id")
      .range(a, b),
  );
  return rows.map((r) => ({
    description: String(r.description ?? ""),
    conceptId: String(r.concept_id),
    date: String(r.transaction_date),
  }));
}
