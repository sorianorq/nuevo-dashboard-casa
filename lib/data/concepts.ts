import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Owner } from "@/lib/balance";
import { assertOwner, type DataContext } from "./session";
import { fetchAll } from "./query";

import { SECTION_ORDER, type ConceptOption, type ConceptSection } from "@/lib/labels";

export type { ConceptOption, ConceptSection };

/**
 * Conceptos asignables a movimientos de un Balance: catálogo del owner, sin
 * archivados ni subtotales (un subtotal es la suma de sus hijos).
 */
export async function listConcepts(ctx: DataContext, owner: Owner): Promise<ConceptOption[]> {
  assertOwner(ctx, owner);
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase
      .from("andrea_concepts")
      .select("id, concept, section, kind, parent_id, sort_order, archived")
      .eq("owner", owner)
      .order("sort_order", { ascending: true })
      .order("id")
      .range(a, b),
  );
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  return rows
    .filter((r) => !r.archived && r.kind !== "subtotal")
    .map((r) => ({
      id: String(r.id),
      name: String(r.concept),
      section: (SECTION_ORDER.includes(r.section) ? r.section : "gastos") as ConceptSection,
      parentName: r.parent_id ? String(byId.get(String(r.parent_id))?.concept ?? "") || null : null,
    }))
    .sort((x, y) => SECTION_ORDER.indexOf(x.section) - SECTION_ORDER.indexOf(y.section));
}

/** Comprueba que el concepto es del Balance indicado. */
export async function conceptBelongsTo(ctx: DataContext, conceptId: string, owner: Owner) {
  assertOwner(ctx, owner);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("andrea_concepts")
    .select("id")
    .eq("id", conceptId)
    .eq("owner", owner)
    .maybeSingle();
  if (error) throw new Error(`Error de base de datos: ${error.message}`);
  return Boolean(data);
}

/**
 * Crea un concepto enlazado a movimientos en el catálogo del Balance.
 * Devuelve el existente si ya hay uno con el mismo nombre (única owner+concept).
 */
export async function createConcept(
  ctx: DataContext,
  owner: Owner,
  name: string,
  section: ConceptSection,
): Promise<ConceptOption> {
  assertOwner(ctx, owner);
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("El nombre del concepto está vacío.");
  if (clean.length > 80) throw new Error("El nombre del concepto es demasiado largo.");

  const supabase = await createClient();
  const existing = await supabase
    .from("andrea_concepts")
    .select("id, concept, section, archived")
    .eq("owner", owner)
    .eq("concept", clean)
    .maybeSingle();
  if (existing.error) throw new Error(`Error de base de datos: ${existing.error.message}`);
  if (existing.data) {
    if (existing.data.archived) throw new Error("Ya existe un concepto archivado con ese nombre.");
    return {
      id: String(existing.data.id),
      name: String(existing.data.concept),
      section: existing.data.section as ConceptSection,
      parentName: null,
    };
  }

  const { data, error } = await supabase
    .from("andrea_concepts")
    .insert({
      user_id: ctx.userId,
      owner,
      concept: clean,
      section,
      kind: "linked",
      link_source: "movimientos",
      sort_order: 900,
    })
    .select("id, concept, section")
    .single();
  if (error) throw new Error(`No se pudo crear el concepto: ${error.message}`);
  return { id: String(data.id), name: String(data.concept), section: data.section as ConceptSection, parentName: null };
}
