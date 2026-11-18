"use server";

import { refresh } from "next/cache";
import { getDataContext, setBudgets } from "@/lib/data";
import { parseBalanceTab } from "@/lib/balance";
import { parseYm, todayIso } from "@/lib/months";

/**
 * Acciones de Presupuesto. El Balance sale de la pestaña (casa | personal)
 * resuelta en el servidor con la sesión; el navegador nunca elige owner.
 */

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Pone o quita partidas del mes. `onlyMissing` (Copiar mes anterior): no
 * toca las que ya tienen importe.
 */
export async function saveBudgets(
  tab: string,
  month: string,
  items: { conceptId: string; amount: number | null }[],
  onlyMissing = false,
): Promise<ActionResult<{ count: number }>> {
  try {
    const ym = parseYm(month);
    if (
      !ym ||
      !Array.isArray(items) ||
      !items.every((i) => i && isId(i.conceptId) && (i.amount === null || typeof i.amount === "number"))
    ) {
      throw new Error("Datos no válidos.");
    }
    const ctx = await getDataContext({ balance: parseBalanceTab(tab) });
    const count = await setBudgets(ctx, ym, todayIso(), items, { onlyMissing: onlyMissing === true });
    refresh();
    return { ok: true, count };
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "";
    if (/row-level security|permission denied/i.test(message)) {
      return { ok: false, error: "Sin permiso para guardar el presupuesto (falta el script 10)." };
    }
    return { ok: false, error: message || "No se pudo completar la acción." };
  }
}
