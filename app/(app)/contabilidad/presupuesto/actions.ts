"use server";

import { refresh } from "next/cache";
import { createBudgetConcept, getDataContext, setBudgets } from "@/lib/data";
import { todayIso } from "@/lib/months";
import { parseBalanceTab } from "@/lib/balance";

/**
 * Acciones de Presupuesto. El Balance sale de la pestaña (casa | personal)
 * resuelta en el servidor con la sesión; el navegador nunca elige owner.
 */

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Pone o quita el presupuesto fijo al mes de varios conceptos. */
export async function saveBudgets(
  tab: string,
  items: { conceptId: string; amount: number | null }[],
): Promise<ActionResult<{ count: number }>> {
  try {
    if (
      !Array.isArray(items) ||
      !items.every((i) => i && isId(i.conceptId) && (i.amount === null || typeof i.amount === "number"))
    ) {
      throw new Error("Datos no válidos.");
    }
    const ctx = await getDataContext({ balance: parseBalanceTab(tab) });
    const count = await setBudgets(ctx, items);
    refresh();
    return { ok: true, count };
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "";
    if (/row-level security|permission denied/i.test(message)) {
      return { ok: false, error: "Sin permiso para guardar el presupuesto de este Balance." };
    }
    return { ok: false, error: message || "No se pudo completar la acción." };
  }
}

const isName = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 80;

/** Crear un concepto nuevo (y, si se pide, su grupo nuevo) con su importe al mes. */
export async function createConceptInBudget(
  tab: string,
  input: {
    name: string;
    section: "gastos" | "ahorro";
    parentId: string | null;
    newGroup: string | null;
    kind: "linked" | "manual";
    amount: number;
  },
): Promise<ActionResult<{ id: string }>> {
  try {
    if (
      !input ||
      !isName(input.name) ||
      (input.section !== "gastos" && input.section !== "ahorro") ||
      (input.parentId !== null && !isId(input.parentId)) ||
      (input.newGroup !== null && !isName(input.newGroup)) ||
      (input.kind !== "linked" && input.kind !== "manual") ||
      typeof input.amount !== "number"
    ) {
      throw new Error("Datos no válidos.");
    }
    const ctx = await getDataContext({ balance: parseBalanceTab(tab) });
    const created = await createBudgetConcept(ctx, input, Number(todayIso().slice(0, 4)));
    refresh();
    return { ok: true, id: created.id };
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "";
    if (/row-level security|permission denied/i.test(message)) {
      return { ok: false, error: "Sin permiso para crear conceptos en este Balance." };
    }
    return { ok: false, error: message || "No se pudo crear el concepto." };
  }
}
