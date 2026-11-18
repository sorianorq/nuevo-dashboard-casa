"use server";

import { refresh } from "next/cache";
import {
  createBalanceConcept,
  getDataContext,
  moveBalanceConcept,
  setCellComment,
  setConceptArchived,
  setConceptHidden,
  setManualAmount,
  updateBalanceConcept,
} from "@/lib/data";
import { parseBalanceTab } from "@/lib/balance";
import { PERIODICITIES, SECTION_ORDER, type ConceptSection, type Periodicity } from "@/lib/labels";
import type { LinkSource } from "@/lib/calc/balance";

/**
 * Acciones de Balances. Cada una vuelve a leer la sesión y resuelve el
 * Balance en el servidor a partir de la pestaña (casa | personal): el
 * navegador nunca elige usuario ni owner.
 */

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function ctxFor(tab: unknown) {
  return getDataContext({ balance: parseBalanceTab(tab) });
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "";
    // RLS sin las políticas del script 05: mensaje claro en vez del de Postgres.
    if (/andrea_concepts_user_id_concept_key/.test(message)) {
      return { ok: false, error: "Ya tienes un concepto con ese nombre en otro Balance: falta el script 09 (un nombre por Balance)." };
    }
    if (/row-level security|permission denied/i.test(message)) {
      return { ok: false, error: "Sin permiso para guardar en este Balance (falta el script 05 de permisos)." };
    }
    return { ok: false, error: message || "No se pudo completar la acción." };
  }
}

const isId = (v: unknown): v is string =>
  typeof v === "string" && (/^[0-9a-f-]{36}$/i.test(v) || /^\d{1,18}$/.test(v));
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isPeriodicity = (v: unknown): v is Periodicity | null =>
  v === null || (typeof v === "string" && (PERIODICITIES as readonly string[]).includes(v));

export async function saveCell(
  tab: string,
  input: { conceptId: string; year: number; month: number; amount: number | null; comment: string },
) {
  return run(async () => {
    if (
      !input ||
      !isId(input.conceptId) ||
      !isInt(input.year, 2000, 2100) ||
      !isInt(input.month, 1, 12) ||
      (input.amount !== null && (typeof input.amount !== "number" || !Number.isFinite(input.amount))) ||
      typeof input.comment !== "string"
    ) {
      throw new Error("Datos no válidos.");
    }
    const ctx = await ctxFor(tab);
    await setManualAmount(ctx, input.conceptId, input.year, input.month, input.amount);
    await setCellComment(ctx, input.conceptId, input.year, input.month, input.comment);
    refresh();
    return {};
  });
}

export async function addConcept(
  tab: string,
  input: {
    name: string;
    section: ConceptSection;
    kind: "manual" | "linked";
    linkSource: LinkSource | null;
    parentId: string | null;
    periodicity: Periodicity | null;
    fillAmount: number | null;
    fillYear: number;
  },
) {
  return run(async () => {
    const sources: (LinkSource | null)[] = ["movimientos", "pagos", "supermercado", null];
    if (
      !input ||
      typeof input.name !== "string" ||
      !SECTION_ORDER.includes(input.section) ||
      (input.kind !== "manual" && input.kind !== "linked") ||
      !sources.includes(input.linkSource) ||
      (input.parentId !== null && !isId(input.parentId)) ||
      !isPeriodicity(input.periodicity) ||
      (input.fillAmount !== null && (typeof input.fillAmount !== "number" || !Number.isFinite(input.fillAmount))) ||
      !isInt(input.fillYear, 2000, 2100)
    ) {
      throw new Error("Datos no válidos.");
    }
    const ctx = await ctxFor(tab);
    const created = await createBalanceConcept(ctx, input);
    refresh();
    return created;
  });
}

export async function editConcept(tab: string, conceptId: string, input: { name: string; periodicity: Periodicity | null }) {
  return run(async () => {
    if (!isId(conceptId) || !input || typeof input.name !== "string" || !isPeriodicity(input.periodicity)) {
      throw new Error("Datos no válidos.");
    }
    const ctx = await ctxFor(tab);
    await updateBalanceConcept(ctx, conceptId, input);
    refresh();
    return {};
  });
}

export async function moveConcept(tab: string, conceptId: string, direction: "up" | "down") {
  return run(async () => {
    if (!isId(conceptId) || (direction !== "up" && direction !== "down")) throw new Error("Datos no válidos.");
    const ctx = await ctxFor(tab);
    await moveBalanceConcept(ctx, conceptId, direction);
    refresh();
    return {};
  });
}

export async function archiveConcept(tab: string, conceptId: string, archived: boolean) {
  return run(async () => {
    if (!isId(conceptId) || typeof archived !== "boolean") throw new Error("Datos no válidos.");
    const ctx = await ctxFor(tab);
    await setConceptArchived(ctx, conceptId, archived);
    refresh();
    return {};
  });
}

export async function hideConcept(tab: string, conceptId: string, hidden: boolean) {
  return run(async () => {
    if (!isId(conceptId) || typeof hidden !== "boolean") throw new Error("Datos no válidos.");
    const ctx = await ctxFor(tab);
    await setConceptHidden(ctx, conceptId, hidden);
    refresh();
    return {};
  });
}
