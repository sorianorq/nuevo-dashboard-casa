"use server";

import { refresh } from "next/cache";
import { createPurchase, deletePurchase, updatePurchase, type PurchaseInput } from "@/lib/data";

/**
 * Acciones de Supermercado (sección compartida). El usuario sale siempre de la
 * sesión en el servidor; la validación completa está en lib/data.
 */

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "";
    if (/row-level security|permission denied/i.test(message)) {
      return { ok: false, error: "Sin permiso para guardar compras (falta el script 07 de permisos)." };
    }
    return { ok: false, error: message || "No se pudo completar la acción." };
  }
}

const isId = (v: unknown): v is string =>
  typeof v === "string" && (/^[0-9a-f-]{36}$/i.test(v) || /^\d{1,18}$/.test(v));

function validInput(v: unknown): v is PurchaseInput {
  const i = v as PurchaseInput;
  return (
    !!i &&
    typeof i.date === "string" &&
    typeof i.store === "string" &&
    typeof i.payment === "string" &&
    typeof i.paidBy === "string" &&
    Array.isArray(i.lines) &&
    i.lines.every((l) => l && typeof l.catId === "string" && typeof l.amount === "number")
  );
}

export async function savePurchase(id: string | null, input: PurchaseInput) {
  return run(async () => {
    if ((id !== null && !isId(id)) || !validInput(input)) throw new Error("Datos no válidos.");
    const result = id ? (await updatePurchase(id, input), { id }) : await createPurchase(input);
    refresh();
    return result;
  });
}

export async function removePurchase(id: string) {
  return run(async () => {
    if (!isId(id)) throw new Error("Datos no válidos.");
    await deletePurchase(id);
    refresh();
    return {};
  });
}
