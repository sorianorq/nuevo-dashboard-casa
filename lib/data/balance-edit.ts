import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ConceptKind, LinkSource } from "@/lib/calc/balance";
import { SECTION_ORDER, type ConceptSection } from "@/lib/labels";
import { assertOwner, type DataContext } from "./session";
import { fetchAll } from "./query";

/**
 * Edición del Balance activo (`ctx.owner`). Todas las funciones comprueban que
 * el concepto es de ese Balance; RLS (script 05) lo vuelve a comprobar.
 * Se borra un importe o comentario al quitarlo, y un concepto con el icono de
 * borrar (lo asignado pasa a su «Otros», script 11).
 */


type ConceptRow = {
  id: string;
  concept: string;
  section: ConceptSection;
  kind: ConceptKind;
  parent_id: string | null;
  sort_order: number;
  archived: boolean;
  periodicity: string | null;
};

const dbError = (e: { message: string }) => new Error(`Error de base de datos: ${e.message}`);

async function loadConcept(ctx: DataContext, conceptId: string): Promise<ConceptRow> {
  assertOwner(ctx, ctx.owner);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("andrea_concepts")
    .select("id, concept, section, kind, parent_id, sort_order, archived, periodicity")
    .eq("id", conceptId)
    .eq("owner", ctx.owner)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new Error("Ese concepto no es de este Balance.");
  return { ...data, id: String(data.id), parent_id: data.parent_id ? String(data.parent_id) : null } as ConceptRow;
}

function checkCell(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Año no válido.");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Mes no válido.");
}

/** Filas de una celda: por concept_id o, en las antiguas, por nombre. */
async function cellRows(table: "andrea_balance" | "andrea_comments", ctx: DataContext, c: ConceptRow, year: number, month: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("owner", ctx.owner)
    .eq("year", year)
    .eq("month", month)
    .or(`concept_id.eq.${c.id},concept.eq."${c.concept.replace(/"/g, '\\"')}"`)
    .order("id");
  if (error) throw dbError(error);
  return (data ?? []).map((r) => String(r.id));
}

/**
 * Importe escrito a mano en una celda (manual, o sobre un enlazado: manda).
 * `amount` null = quitar el importe (en un enlazado vuelve el automático).
 */
export async function setManualAmount(ctx: DataContext, conceptId: string, year: number, month: number, amount: number | null) {
  checkCell(year, month);
  const c = await loadConcept(ctx, conceptId);
  if (c.kind === "subtotal") throw new Error("Un subtotal es la suma de sus conceptos: no se escribe a mano.");
  if (amount !== null && (!Number.isFinite(amount) || Math.abs(amount) >= 1e9)) throw new Error("Importe no válido.");

  const supabase = await createClient();
  const ids = await cellRows("andrea_balance", ctx, c, year, month);
  if (amount === null) {
    if (ids.length) {
      const { error } = await supabase.from("andrea_balance").delete().in("id", ids).eq("owner", ctx.owner);
      if (error) throw dbError(error);
    }
    return;
  }
  const value = Math.round(amount * 100) / 100;
  if (ids.length) {
    const { error } = await supabase
      .from("andrea_balance")
      .update({ amount: value, concept: c.concept, concept_id: c.id, section: c.section })
      .in("id", ids)
      .eq("owner", ctx.owner);
    if (error) throw dbError(error);
  } else {
    const { error } = await supabase.from("andrea_balance").insert({
      user_id: ctx.userId,
      owner: ctx.owner,
      year,
      month,
      concept: c.concept,
      concept_id: c.id,
      section: c.section,
      amount: value,
    });
    if (error) throw dbError(error);
  }
}

/** Comentario de una celda. Texto vacío = quitarlo. */
export async function setCellComment(ctx: DataContext, conceptId: string, year: number, month: number, text: string) {
  checkCell(year, month);
  const c = await loadConcept(ctx, conceptId);
  const comment = text.trim();
  if (comment.length > 1000) throw new Error("El comentario es demasiado largo (máximo 1.000 caracteres).");

  const supabase = await createClient();
  const ids = await cellRows("andrea_comments", ctx, c, year, month);
  if (!comment) {
    if (ids.length) {
      const { error } = await supabase.from("andrea_comments").delete().in("id", ids).eq("owner", ctx.owner);
      if (error) throw dbError(error);
    }
    return;
  }
  if (ids.length) {
    const { error } = await supabase
      .from("andrea_comments")
      .update({ comment, concept: c.concept, concept_id: c.id })
      .in("id", ids)
      .eq("owner", ctx.owner);
    if (error) throw dbError(error);
  } else {
    const { error } = await supabase.from("andrea_comments").insert({
      user_id: ctx.userId,
      owner: ctx.owner,
      year,
      month,
      concept: c.concept,
      concept_id: c.id,
      comment,
    });
    if (error) throw dbError(error);
  }
}

function cleanName(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("El nombre del concepto está vacío.");
  if (clean.length > 80) throw new Error("El nombre del concepto es demasiado largo.");
  return clean;
}

async function nameTaken(ctx: DataContext, name: string, exceptId?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("andrea_concepts")
    .select("id, concept")
    .eq("owner", ctx.owner)
    .ilike("concept", name.replace(/[%_\\]/g, (m) => `\\${m}`));
  if (error) throw dbError(error);
  return (data ?? []).some((r) => String(r.id) !== exceptId && String(r.concept).toLowerCase() === name.toLowerCase());
}

export type NewConceptInput = {
  name: string;
  section: ConceptSection;
  kind: "manual" | "linked";
  linkSource: LinkSource | null;
  parentId: string | null;
  /** Texto libre (p. ej. «Día 5 c/mes»); "" = vacío. */
  periodicity: string | null;
  /** Solo manual: importe para rellenar los 12 meses de `fillYear`. */
  fillAmount: number | null;
  fillYear: number;
};

/** «+ Concepto»: alta en el catálogo del Balance activo. */
export async function createBalanceConcept(ctx: DataContext, input: NewConceptInput): Promise<{ id: string }> {
  assertOwner(ctx, ctx.owner);
  const name = cleanName(input.name);
  if (!SECTION_ORDER.includes(input.section)) throw new Error("Bloque no válido.");
  if (input.kind === "linked" && !input.linkSource) throw new Error("Elige de dónde sale el importe automático.");
  if (await nameTaken(ctx, name)) throw new Error("Ya hay un concepto con ese nombre en este Balance (puede estar archivado).");

  const supabase = await createClient();
  if (input.parentId) {
    const parent = await loadConcept(ctx, input.parentId);
    if (parent.kind !== "subtotal" || parent.section !== input.section) throw new Error("Ese grupo no es válido para este bloque.");
  }

  // Al final de su bloque (o de su grupo).
  const siblings = await fetchAll((a, b) =>
    supabase
      .from("andrea_concepts")
      .select("id, sort_order, section, parent_id")
      .eq("owner", ctx.owner)
      .eq("section", input.section)
      .order("id")
      .range(a, b),
  );
  const sameLevel = siblings.filter((s) => (s.parent_id ? String(s.parent_id) : null) === input.parentId);
  const pool = sameLevel.length ? sameLevel : siblings;
  const sortOrder = pool.reduce((m, s) => Math.max(m, Number(s.sort_order) || 0), 0) + 10;

  const { data, error } = await supabase
    .from("andrea_concepts")
    .insert({
      user_id: ctx.userId,
      owner: ctx.owner,
      concept: name,
      section: input.section,
      kind: input.kind,
      link_source: input.kind === "linked" ? input.linkSource : null,
      parent_id: input.parentId,
      periodicity: input.periodicity,
      // Los de gastos automáticos se ofrecen también al apuntar gastos a mano (formulario y bot).
      pagos_visible: input.kind === "linked" && (input.linkSource === "pagos" || input.section === "gastos"),
      sort_order: sortOrder,
      archived: false,
    })
    .select("id")
    .single();
  if (error) throw dbError(error);
  const id = String(data.id);

  if (input.kind === "manual" && input.fillAmount !== null && input.fillAmount !== 0) {
    if (!Number.isFinite(input.fillAmount) || Math.abs(input.fillAmount) >= 1e9) throw new Error("Importe no válido.");
    checkCell(input.fillYear, 1);
    const amount = Math.round(input.fillAmount * 100) / 100;
    const { error: fillError } = await supabase.from("andrea_balance").insert(
      Array.from({ length: 12 }, (_, i) => ({
        user_id: ctx.userId,
        owner: ctx.owner,
        year: input.fillYear,
        month: i + 1,
        concept: name,
        concept_id: id,
        section: input.section,
        amount,
      })),
    );
    if (fillError) throw new Error(`Concepto creado, pero no se pudo rellenar el año: ${fillError.message}`);
  }
  return { id };
}

/**
 * Renombrar y periodicidad. Al renombrar se actualiza también el nombre en
 * los importes y comentarios guardados (la versión anterior los enlazaba por
 * nombre), así no se pierde nada.
 */
export async function updateBalanceConcept(
  ctx: DataContext,
  conceptId: string,
  input: { name: string; periodicity: string | null },
) {
  const c = await loadConcept(ctx, conceptId);
  const name = cleanName(input.name);
  const supabase = await createClient();

  if (name !== c.concept) {
    if (await nameTaken(ctx, name, c.id)) throw new Error("Ya hay un concepto con ese nombre en este Balance.");
    for (const table of ["andrea_balance", "andrea_comments"] as const) {
      const { error } = await supabase
        .from(table)
        .update({ concept: name, concept_id: c.id })
        .eq("owner", ctx.owner)
        .or(`concept_id.eq.${c.id},concept.eq."${c.concept.replace(/"/g, '\\"')}"`);
      if (error) throw dbError(error);
    }
  }
  const { error } = await supabase
    .from("andrea_concepts")
    .update({ concept: name, periodicity: input.periodicity })
    .eq("id", c.id)
    .eq("owner", ctx.owner);
  if (error) throw dbError(error);
}

/** Subir o bajar un concepto entre sus hermanos (mismo bloque y grupo). */
export async function moveBalanceConcept(ctx: DataContext, conceptId: string, direction: "up" | "down") {
  const c = await loadConcept(ctx, conceptId);
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase
      .from("andrea_concepts")
      .select("id, concept, sort_order, parent_id, archived")
      .eq("owner", ctx.owner)
      .eq("section", c.section)
      .order("id")
      .range(a, b),
  );
  const siblings = rows
    .filter((r) => (r.parent_id ? String(r.parent_id) : null) === c.parent_id && (!r.archived || String(r.id) === c.id))
    .sort((x, y) => (Number(x.sort_order) || 0) - (Number(y.sort_order) || 0) || String(x.concept).localeCompare(String(y.concept), "es"));
  const index = siblings.findIndex((s) => String(s.id) === c.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= siblings.length) return;

  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  // Se renumeran los hermanos (de 10 en 10, desde el primer orden del grupo)
  // para que no haya empates.
  const start = Math.min(...siblings.map((s) => Number(s.sort_order) || 0));
  const updates = siblings
    .map((s, i) => ({ id: String(s.id), sort_order: start + i * 10, prev: Number(s.sort_order) }))
    .filter((u) => u.sort_order !== u.prev);
  for (const u of updates) {
    const { error } = await supabase
      .from("andrea_concepts")
      .update({ sort_order: u.sort_order })
      .eq("id", u.id)
      .eq("owner", ctx.owner);
    if (error) throw dbError(error);
  }
}

/** Archivar (o recuperar): no se borra; el histórico sigue en los años con datos. */
export async function setConceptArchived(ctx: DataContext, conceptId: string, archived: boolean) {
  const c = await loadConcept(ctx, conceptId);
  const supabase = await createClient();
  if (archived && c.kind === "subtotal") {
    const { data, error } = await supabase
      .from("andrea_concepts")
      .select("id")
      .eq("owner", ctx.owner)
      .eq("parent_id", c.id)
      .eq("archived", false)
      .limit(1);
    if (error) throw dbError(error);
    if (data?.length) throw new Error("Archiva antes los conceptos de este grupo.");
  }
  const { error } = await supabase
    .from("andrea_concepts")
    .update({ archived })
    .eq("id", c.id)
    .eq("owner", ctx.owner);
  if (error) throw dbError(error);
}

// --- Filas ocultas (por usuario, en user_preferences) -----------------------

const HIDDEN_KEY = "balance_hidden";

async function readHiddenPref(ctx: DataContext): Promise<{ exists: boolean; value: Record<string, string[]> }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_preferences")
    .select("value")
    .eq("user_id", ctx.userId)
    .eq("key", HIDDEN_KEY)
    .maybeSingle();
  if (error) throw dbError(error);
  const raw = data?.value;
  const value: Record<string, string[]> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) value[k] = v.filter((x): x is string => typeof x === "string");
    }
  }
  return { exists: Boolean(data), value };
}

/** Conceptos ocultos por el usuario en el Balance activo (siguen sumando). */
export async function getHiddenConcepts(ctx: DataContext): Promise<string[]> {
  assertOwner(ctx, ctx.owner);
  try {
    return (await readHiddenPref(ctx)).value[ctx.owner] ?? [];
  } catch {
    // Sin permisos todavía (script 05): no se oculta nada.
    return [];
  }
}

export async function setConceptHidden(ctx: DataContext, conceptId: string, hidden: boolean) {
  await loadConcept(ctx, conceptId);
  const supabase = await createClient();
  const pref = await readHiddenPref(ctx);
  const current = new Set(pref.value[ctx.owner] ?? []);
  if (hidden) current.add(conceptId);
  else current.delete(conceptId);
  const value = { ...pref.value, [ctx.owner]: [...current] };
  const { error } = pref.exists
    ? await supabase.from("user_preferences").update({ value }).eq("user_id", ctx.userId).eq("key", HIDDEN_KEY)
    : await supabase.from("user_preferences").insert({ user_id: ctx.userId, key: HIDDEN_KEY, value });
  if (error) throw dbError(error);
}

// --- Borrar un concepto (script 11) -----------------------------------------

/** Nombre del «Otros» que se crea si el bloque no tiene ninguno. */
const DEFAULT_OTHERS: Record<ConceptSection, string> = {
  ingresos: "Otros ingresos",
  gastos: "Otros gastos",
  ahorro: "Otras inversiones",
};
const isOthers = (name: string) => /^otr[oa]s\b/i.test(name.trim());

type DeletePlan = {
  concept: ConceptRow;
  /** Subtotal: sus conceptos quedan sueltos. */
  children: number;
  /** Destino de lo asignado (null en un subtotal). */
  target: { id: string | null; name: string; create: boolean; unarchive: boolean } | null;
  counts: { transactions: number; manual: number; amounts: number; comments: number; budgets: number };
};

/**
 * Decide adónde va lo del concepto: el «Otros…» de su mismo grupo; si no, el
 * «Otros…» suelto del bloque (el de nombre por defecto primero); si no hay,
 * se crea (o se recupera si está archivado).
 */
async function deletePlan(ctx: DataContext, conceptId: string): Promise<DeletePlan> {
  const c = await loadConcept(ctx, conceptId);
  const supabase = await createClient();
  const all = (await fetchAll((a, b) =>
    supabase
      .from("andrea_concepts")
      .select("id, concept, section, kind, parent_id, sort_order, archived, periodicity")
      .eq("owner", ctx.owner)
      .order("id")
      .range(a, b),
  )).map((r) => ({ ...r, id: String(r.id), parent_id: r.parent_id ? String(r.parent_id) : null }) as ConceptRow);

  const n = (r: { count: number | null; error: { message: string } | null }) => {
    if (r.error) throw dbError(r.error);
    return r.count ?? 0;
  };
  const head = { count: "exact" as const, head: true };
  const byIdOrName = `concept_id.eq.${c.id},and(concept_id.is.null,concept.eq."${c.concept.replace(/"/g, '\\"')}")`;
  const [transactions, manual, amounts, comments, budgets] =
    c.kind === "subtotal"
      ? [0, 0, 0, 0, 0]
      : (
          await Promise.all([
            supabase.from("transactions").select("id", head).eq("concept_id", c.id),
            supabase.from("amex_expenses").select("id", head).eq("concept_id", c.id),
            supabase.from("andrea_balance").select("id", head).eq("owner", ctx.owner).or(byIdOrName),
            supabase.from("andrea_comments").select("id", head).eq("owner", ctx.owner).or(byIdOrName),
            supabase.from("monthly_budgets").select("id", head).eq("owner", ctx.owner).eq("concept_id", c.id),
          ])
        ).map(n);
  const counts = { transactions, manual, amounts, comments, budgets };

  if (c.kind === "subtotal") {
    return { concept: c, children: all.filter((r) => r.parent_id === c.id).length, target: null, counts };
  }
  const usable = all.filter((r) => r.id !== c.id && r.section === c.section && r.kind !== "subtotal");
  const active = usable.filter((r) => !r.archived);
  const pick =
    (c.parent_id ? active.find((r) => r.parent_id === c.parent_id && isOthers(r.concept)) : undefined) ??
    active.find((r) => r.parent_id === null && r.concept.toLowerCase() === DEFAULT_OTHERS[c.section].toLowerCase()) ??
    active.find((r) => r.parent_id === null && isOthers(r.concept)) ??
    active.find((r) => isOthers(r.concept));
  if (pick) return { concept: c, children: 0, target: { id: pick.id, name: pick.concept, create: false, unarchive: false }, counts };

  const name = DEFAULT_OTHERS[c.section];
  const archived = usable.find((r) => r.concept.toLowerCase() === name.toLowerCase());
  if (archived) return { concept: c, children: 0, target: { id: archived.id, name: archived.concept, create: false, unarchive: true }, counts };
  if (all.some((r) => r.concept.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Ya existe «${name}» como grupo: renómbralo antes de borrar este concepto.`);
  }
  return { concept: c, children: 0, target: { id: null, name, create: true, unarchive: false }, counts };
}

export type DeletePreview = {
  name: string;
  subtotal: boolean;
  children: number;
  target: string | null;
  createTarget: boolean;
  counts: DeletePlan["counts"];
};

/** Lo que pasará al borrar (para el aviso de confirmación). */
export async function previewDeleteConcept(ctx: DataContext, conceptId: string): Promise<DeletePreview> {
  const p = await deletePlan(ctx, conceptId);
  return {
    name: p.concept.concept,
    subtotal: p.concept.kind === "subtotal",
    children: p.children,
    target: p.target?.name ?? null,
    createTarget: Boolean(p.target?.create || p.target?.unarchive),
    counts: p.counts,
  };
}

/**
 * Borra un concepto: lo asignado pasa a su «Otros» (script 11, todo o nada).
 * Un subtotal se borra y sus conceptos quedan sueltos en el bloque.
 */
export async function deleteBalanceConcept(ctx: DataContext, conceptId: string) {
  const p = await deletePlan(ctx, conceptId);
  const supabase = await createClient();
  let targetId: string | null = p.target?.id ?? null;

  if (p.target?.unarchive && targetId) {
    const { error } = await supabase.from("andrea_concepts").update({ archived: false, parent_id: null }).eq("id", targetId).eq("owner", ctx.owner);
    if (error) throw dbError(error);
  }
  if (p.target?.create) {
    const section = p.concept.section;
    const created = await createBalanceConcept(ctx, {
      name: p.target.name,
      section,
      kind: p.concept.kind === "manual" ? "manual" : "linked",
      linkSource: p.concept.kind === "manual" ? null : "movimientos",
      parentId: null,
      periodicity: null,
      fillAmount: null,
      fillYear: new Date().getFullYear(),
    });
    targetId = created.id;
    if (section === "gastos" && p.concept.kind !== "manual") {
      await supabase.from("andrea_concepts").update({ pagos_visible: true }).eq("id", targetId).eq("owner", ctx.owner);
    }
  }

  const { error } = await supabase.rpc("fc_delete_concept", { p_concept: p.concept.id, p_target: targetId });
  if (error) {
    if (/fc_delete_concept|function .* does not exist|PGRST202/i.test(`${error.message} ${error.code ?? ""}`)) {
      throw new Error("Para borrar conceptos falta ejecutar el script 11 en Supabase.");
    }
    throw dbError(error);
  }
  return { target: p.target?.name ?? null };
}

/** Texto libre de un concepto (columna de notas / periodicidad). "" = vacío. */
export async function setConceptNote(ctx: DataContext, conceptId: string, text: string) {
  const c = await loadConcept(ctx, conceptId);
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length > 60) throw new Error("El texto es demasiado largo (máximo 60 caracteres).");
  const supabase = await createClient();
  const { error } = await supabase.from("andrea_concepts").update({ periodicity: clean }).eq("id", c.id).eq("owner", ctx.owner);
  if (error) throw dbError(error);
}

// --- Choques al cargar un extracto ------------------------------------------

export type ManualConflict = {
  conceptId: string;
  conceptName: string;
  year: number;
  month: number;
  /** Lo escrito a mano en esa celda. */
  written: number;
};

/**
 * Celdas (concepto enlazado al banco × mes) con importe escrito a mano: si se
 * importan movimientos ahí, lo escrito manda y el extracto no se vería.
 */
export async function manualConflicts(
  ctx: DataContext,
  cells: { conceptId: string; year: number; month: number }[],
): Promise<ManualConflict[]> {
  assertOwner(ctx, ctx.owner);
  const ids = [...new Set(cells.map((c) => c.conceptId))];
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data: concepts, error } = await supabase
    .from("andrea_concepts")
    .select("id, concept, kind, link_source")
    .eq("owner", ctx.owner)
    .in("id", ids);
  if (error) throw dbError(error);
  const linked = new Map(
    (concepts ?? [])
      .filter((c) => c.kind === "linked" && (c.link_source ?? "movimientos") === "movimientos")
      .map((c) => [String(c.id), String(c.concept)]),
  );
  if (!linked.size) return [];
  const years = [...new Set(cells.map((c) => c.year))];
  const names = [...linked.values()].map((n) => `"${n.replace(/"/g, '\\"')}"`).join(",");
  const rows = await fetchAll((a, b) =>
    supabase
      .from("andrea_balance")
      .select("concept, concept_id, year, month, amount")
      .eq("owner", ctx.owner)
      .in("year", years)
      .or(`concept_id.in.(${[...linked.keys()].join(",")}),and(concept_id.is.null,concept.in.(${names}))`)
      .order("id")
      .range(a, b),
  );
  const idOfName = new Map([...linked].map(([id, n]) => [n, id]));
  const written = new Map<string, number>();
  for (const r of rows) {
    const id = r.concept_id ? String(r.concept_id) : idOfName.get(String(r.concept));
    if (!id || !linked.has(id) || r.amount === null) continue;
    const key = `${id}|${r.year}|${r.month}`;
    written.set(key, Math.round(((written.get(key) ?? 0) + Number(r.amount)) * 100) / 100);
  }
  const seen = new Set<string>();
  const out: ManualConflict[] = [];
  for (const c of cells) {
    const key = `${c.conceptId}|${c.year}|${c.month}`;
    if (seen.has(key) || !written.has(key)) continue;
    seen.add(key);
    out.push({ conceptId: c.conceptId, conceptName: linked.get(c.conceptId) as string, year: c.year, month: c.month, written: written.get(key) as number });
  }
  return out.sort((x, y) => x.year - y.year || x.month - y.month || x.conceptName.localeCompare(y.conceptName, "es"));
}
