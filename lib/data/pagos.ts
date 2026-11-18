import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isOwner, isPerson, OWNERS, type Owner, type Person } from "@/lib/balance";
import {
  isPaidBy,
  round2,
  type ConceptRef,
  type PagosConcept,
  type PaidBy,
  type Payment,
  type PaymentMethod,
} from "@/lib/calc/pagos";
import { monthEnd, monthStart, type YearMonth } from "@/lib/months";
import { getDataContext, type DataContext } from "./session";
import { fetchAll, num } from "./query";

/**
 * Pagos (fase 4). Tabla `amex_expenses`:
 *  - American Express (`wallet = 'amex'`): compartida, la ven todos los roles.
 *  - Pagos personales (`wallet` = la persona): su dueño y admin.
 * Un gasto con concepto suma en el Balance de ese concepto (decisión de
 * Ricardo, 18/11/2026); los que salen de una compra (`purchase_id`) cuentan
 * en Supermercado.
 */

const dbError = (e: { message: string }) => new Error(`Error de base de datos: ${e.message}`);

const COLUMNS =
  "id, expense_date, concept, amount, paid_by, pending, comments, concept_id, purchase_id, wallet, payment_method_id";

export function toPayment(r: Record<string, unknown>): Payment {
  return {
    id: String(r.id),
    date: String(r.expense_date),
    description: typeof r.concept === "string" ? r.concept : "",
    amount: num(r.amount),
    paidBy: isPaidBy(r.paid_by) ? r.paid_by : null,
    pending: r.pending === true,
    comment: typeof r.comments === "string" && r.comments.trim() ? r.comments : null,
    conceptId: r.concept_id ? String(r.concept_id) : null,
    purchaseId: r.purchase_id ? String(r.purchase_id) : null,
    wallet: String(r.wallet ?? ""),
    paymentMethodId: r.payment_method_id ? String(r.payment_method_id) : null,
  };
}

/**
 * Conceptos de Pagos de Casa, Andrea y Ricardo. Con el script 08, todos
 * (para apuntar un gasto en el Balance del otro); sin él, solo los de los
 * Balances visibles (`complete = false`).
 */
export async function listPagosConcepts(ctx: DataContext): Promise<{ concepts: PagosConcept[]; complete: boolean }> {
  const supabase = await createClient();
  const toConcept = (r: Record<string, unknown>): PagosConcept | null =>
    isOwner(r.owner)
      ? {
          id: String(r.id),
          owner: r.owner,
          name: String(r.concept),
          archived: r.archived === true,
          sortOrder: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 9999,
        }
      : null;
  const sort = (list: PagosConcept[]) =>
    list.sort((a, b) => OWNERS.indexOf(a.owner) - OWNERS.indexOf(b.owner) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));

  const rpc = await supabase.rpc("fc_pagos_concepts");
  if (!rpc.error) {
    const list = ((rpc.data ?? []) as Record<string, unknown>[]).map(toConcept).filter((c): c is PagosConcept => c !== null);
    return { concepts: sort(list), complete: true };
  }

  // Sin el script 08: lo que deja ver RLS (Casa + el propio Balance, o todo si admin).
  const rows = await fetchAll((a, b) =>
    supabase
      .from("andrea_concepts")
      .select("id, owner, concept, archived, sort_order, kind, link_source, pagos_visible")
      .in("owner", ctx.allowedOwners)
      .eq("kind", "linked")
      .order("id")
      .range(a, b),
  );
  const list = rows
    .filter((r) => r.link_source === "pagos" || r.pagos_visible === true)
    .map(toConcept)
    .filter((c): c is PagosConcept => c !== null);
  return { concepts: sort(list), complete: ctx.allowedOwners.length === OWNERS.length };
}

/** Nombre y Balance de cada concepto usado (los de Pagos y, si se ven, otros). */
async function conceptRefs(ctx: DataContext, concepts: PagosConcept[], ids: string[]) {
  const refs: Record<string, ConceptRef> = {};
  for (const c of concepts) refs[c.id] = { owner: c.owner, name: c.name };
  const missing = [...new Set(ids)].filter((id) => !refs[id]);
  if (missing.length) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("andrea_concepts")
      .select("id, owner, concept")
      .in("id", missing)
      .in("owner", ctx.allowedOwners);
    if (error) throw dbError(error);
    for (const r of data ?? []) if (isOwner(r.owner)) refs[String(r.id)] = { owner: r.owner, name: String(r.concept) };
  }
  return refs;
}

/** Historial para sugerir concepto: gastos ya clasificados (descripción → concepto). */
async function suggestionHistory() {
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase
      .from("amex_expenses")
      .select("id, expense_date, concept, concept_id")
      .not("concept_id", "is", null)
      .is("purchase_id", null)
      .order("id")
      .range(a, b),
  );
  return rows
    .filter((r) => typeof r.concept === "string" && r.concept.trim())
    .map((r) => ({ description: String(r.concept), conceptId: String(r.concept_id), date: String(r.expense_date) }));
}

export type AmexData = {
  /** Gastos de la Amex del mes, del más reciente al más antiguo. */
  month: Payment[];
  /** Pendientes de traspaso (todas las fechas). */
  pending: Payment[];
  spent: number;
  pendingTotal: number;
  byPerson: Record<PaidBy, number>;
  concepts: PagosConcept[];
  /** false = falta el script 08 (no se ven los conceptos del otro). */
  conceptsComplete: boolean;
  refs: Record<string, ConceptRef>;
  history: { description: string; conceptId: string; date: string }[];
};

/** American Express del mes (sección compartida, cualquier rol). */
export async function getAmex(ym: YearMonth): Promise<AmexData> {
  const ctx = await getDataContext();
  const supabase = await createClient();
  const [monthRows, pendingRows, { concepts, complete }, history] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("amex_expenses")
        .select(COLUMNS)
        .eq("wallet", "amex")
        .gte("expense_date", monthStart(ym))
        .lte("expense_date", monthEnd(ym))
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase.from("amex_expenses").select(COLUMNS).eq("wallet", "amex").eq("pending", true).order("id").range(a, b),
    ),
    listPagosConcepts(ctx),
    suggestionHistory(),
  ]);

  const byDate = (a: Payment, b: Payment) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description, "es");
  const month = monthRows.map(toPayment).sort(byDate);
  const pending = pendingRows.map(toPayment).sort(byDate);
  const byPerson: Record<PaidBy, number> = { andrea: 0, ricardo: 0, otros: 0 };
  for (const p of month) byPerson[p.paidBy ?? "otros"] = round2(byPerson[p.paidBy ?? "otros"] + p.amount);

  const ids = [...month, ...pending].map((p) => p.conceptId).filter((id): id is string => id !== null);
  return {
    month,
    pending,
    spent: round2(month.reduce((s, p) => s + p.amount, 0)),
    pendingTotal: round2(pending.reduce((s, p) => s + p.amount, 0)),
    byPerson,
    concepts,
    conceptsComplete: complete,
    refs: await conceptRefs(ctx, concepts, ids),
    history,
  };
}

export type ConceptSpend = { key: string; conceptId: string | null; amount: number; budget: number | null };

export type PersonalData = {
  /** Vista: Casa (gastos apuntados al Balance de Casa) o una persona. */
  person: Owner;
  /** Gastos del mes (de la persona, o con concepto de Casa). */
  month: Payment[];
  spent: number;
  /** Presupuesto del mes de sus conceptos de Pagos (null = sin presupuesto). */
  budget: number | null;
  /** Gastado en sus conceptos con presupuesto (lo que se compara con él). */
  spentBudgeted: number;
  byConcept: ConceptSpend[];
  /** Medios de pago del formulario (los de quien apunta). */
  methods: PaymentMethod[];
  /** Nombre de cada medio de pago que sale en la lista (de cualquier persona visible). */
  methodNames: Record<string, string>;
  concepts: PagosConcept[];
  conceptsComplete: boolean;
  refs: Record<string, ConceptRef>;
  history: { description: string; conceptId: string; date: string }[];
};

/** Medios de pago de una persona (los archivados solo si se usan). */
async function paymentMethods(person: Person): Promise<PaymentMethod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, owner, name, kind, sort_order, archived")
    .eq("owner", person)
    .order("sort_order", { ascending: true })
    .order("name");
  if (error) throw dbError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    kind: r.kind === "tarjeta" || r.kind === "efectivo" ? r.kind : "otro",
    archived: r.archived === true,
  }));
}

/** Ids de todos los conceptos de Casa (también los que no son de Pagos). */
async function casaConceptIds(): Promise<string[]> {
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase.from("andrea_concepts").select("id").eq("owner", "casa").order("id").range(a, b),
  );
  return rows.map((r) => String(r.id));
}

/**
 * Pagos de una vista (Pagos · Casa / <persona>). Las compras del Súper
 * pagadas con Amex no entran: cuentan en Supermercado.
 *  - persona: sus pagos con tarjeta, efectivo… (`wallet` = la persona) y los
 *    que pagó con la Amex;
 *  - Casa: los gastos con concepto del Balance de Casa, pagara quien pagara
 *    (los que RLS deja ver).
 * `me` es quien apunta: sus medios de pago van al formulario.
 */
export async function getPersonalPayments(ctx: DataContext, ym: YearMonth, view: Owner, me: Person): Promise<PersonalData> {
  if (!ctx.allowedOwners.includes(view)) throw new Error("Balance no permitido para este usuario");
  if (!ctx.allowedOwners.includes(me)) throw new Error("Balance no permitido para este usuario");
  const supabase = await createClient();
  const visiblePeople = ctx.allowedOwners.filter((o): o is Person => isPerson(o));
  const [rawRows, casaIds, methodLists, { concepts, complete }, history, budgets] = await Promise.all([
    fetchAll((a, b) => {
      const q = supabase.from("amex_expenses").select(COLUMNS);
      return (view === "casa" ? q.not("concept_id", "is", null) : q.or(`wallet.eq.${view},and(wallet.eq.amex,paid_by.eq.${view})`))
        .is("purchase_id", null)
        .gte("expense_date", monthStart(ym))
        .lte("expense_date", monthEnd(ym))
        .order("id")
        .range(a, b);
    }),
    view === "casa" ? casaConceptIds() : Promise.resolve([] as string[]),
    Promise.all((view === "casa" ? visiblePeople : [view as Person]).map(async (p) => [p, await paymentMethods(p)] as const)),
    listPagosConcepts(ctx),
    suggestionHistory(),
    fetchAll((a, b) =>
      supabase
        .from("monthly_budgets")
        .select("id, concept_id, budget_amount")
        .eq("owner", view)
        .eq("year", ym.year)
        .eq("month", ym.month)
        .order("id")
        .range(a, b),
    ),
  ]);

  const casa = new Set(casaIds);
  const rows = view === "casa" ? rawRows.filter((r) => casa.has(String(r.concept_id))) : rawRows;
  const month = rows
    .map(toPayment)
    .sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description, "es"));

  const own = new Set(concepts.filter((c) => c.owner === view).map((c) => c.id));
  const budgetOf = new Map<string, number>();
  for (const b of budgets) {
    const id = b.concept_id ? String(b.concept_id) : null;
    if (id && own.has(id)) budgetOf.set(id, round2((budgetOf.get(id) ?? 0) + num(b.budget_amount)));
  }

  const spend = new Map<string, ConceptSpend>();
  for (const p of month) {
    const key = p.conceptId ?? "__none";
    const s = spend.get(key) ?? { key, conceptId: p.conceptId, amount: 0, budget: p.conceptId ? (budgetOf.get(p.conceptId) ?? null) : null };
    s.amount = round2(s.amount + p.amount);
    spend.set(key, s);
  }
  for (const [id, budget] of budgetOf) if (!spend.has(id)) spend.set(id, { key: id, conceptId: id, amount: 0, budget });

  const budget = budgetOf.size ? round2([...budgetOf.values()].reduce((s, v) => s + v, 0)) : null;
  const spentBudgeted = round2(month.filter((p) => p.conceptId && budgetOf.has(p.conceptId)).reduce((s, p) => s + p.amount, 0));
  const ids = month.map((p) => p.conceptId).filter((id): id is string => id !== null);

  const methodNames: Record<string, string> = {};
  for (const [, list] of methodLists) for (const m of list) methodNames[m.id] = m.name;
  const methods = methodLists.find(([p]) => p === me)?.[1] ?? (await paymentMethods(me));

  return {
    person: view,
    month,
    spent: round2(month.reduce((s, p) => s + p.amount, 0)),
    budget,
    spentBudgeted,
    byConcept: [...spend.values()].sort((a, b) => b.amount - a.amount || (b.budget ?? 0) - (a.budget ?? 0)),
    methods,
    methodNames,
    concepts,
    conceptsComplete: complete,
    refs: await conceptRefs(ctx, concepts, ids),
    history,
  };
}

export type QuickAddData = {
  me: Person;
  visibleOwners: DataContext["allowedOwners"];
  methods: PaymentMethod[];
  concepts: PagosConcept[];
  conceptsComplete: boolean;
  history: { description: string; conceptId: string; date: string }[];
};

/** Datos del alta rápida (➕): lo mismo que el formulario de Pagos de la persona. */
export async function getQuickAddData(ctx: DataContext): Promise<QuickAddData> {
  const [methods, { concepts, complete }, history] = await Promise.all([
    paymentMethods(ctx.person),
    listPagosConcepts(ctx),
    suggestionHistory(),
  ]);
  return { me: ctx.person, visibleOwners: ctx.allowedOwners, methods, concepts, conceptsComplete: complete, history };
}
