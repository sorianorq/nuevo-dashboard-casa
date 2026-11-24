"use server";

import { refresh } from "next/cache";
import { getDataContext, setBudgets } from "@/lib/data";
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
