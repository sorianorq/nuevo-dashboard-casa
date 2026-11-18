"use server";

import { refresh } from "next/cache";
import {
  createPaymentMethod,
  deletePayment,
  getDataContext,
  getQuickAddData,
  markTransferred,
  savePayment,
  type PaymentInput,
} from "@/lib/data";
import { todayIso } from "@/lib/months";
import type { PaymentMethodKind } from "@/lib/calc/pagos";

/**
 * Acciones de Pagos. El usuario y su rol salen siempre de la sesión en el
 * servidor; las reglas (quién pagó, Balance, concepto) están en lib/data.
 */

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "";
    if (/andrea_concepts_user_id_concept_key/.test(message)) {
      return { ok: false, error: "Ya tienes un concepto con ese nombre en otro Balance: falta el script 09 (un nombre por Balance)." };
    }
    if (/row-level security|permission denied/i.test(message)) {
      return { ok: false, error: "Sin permiso para guardar este gasto." };
    }
    return { ok: false, error: message || "No se pudo completar la acción." };
  }
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function validInput(v: unknown): v is PaymentInput {
  const i = v as PaymentInput;
  return (
    !!i &&
    typeof i.date === "string" &&
    typeof i.description === "string" &&
    typeof i.amount === "number" &&
    typeof i.amex === "boolean" &&
    typeof i.paidBy === "string" &&
    typeof i.owner === "string" &&
    (i.conceptId === null || isId(i.conceptId)) &&
    (i.paymentMethodId === null || isId(i.paymentMethodId)) &&
    typeof i.pending === "boolean" &&
    typeof i.comment === "string"
  );
}

export async function savePaymentAction(id: string | null, input: PaymentInput) {
  return run(async () => {
    if ((id !== null && !isId(id)) || !validInput(input)) throw new Error("Datos no válidos.");
    const result = await savePayment(id, input);
    refresh();
    return result;
  });
}

export async function deletePaymentAction(id: string) {
  return run(async () => {
    if (!isId(id)) throw new Error("Datos no válidos.");
    await deletePayment(id);
    refresh();
    return {};
  });
}

export async function markTransferredAction(ids: string[]) {
  return run(async () => {
    if (!Array.isArray(ids) || !ids.every(isId)) throw new Error("Datos no válidos.");
    const count = await markTransferred(ids);
    refresh();
    return { count };
  });
}

export async function newPaymentMethodAction(name: string, kind: PaymentMethodKind) {
  return run(async () => {
    if (typeof name !== "string" || typeof kind !== "string") throw new Error("Datos no válidos.");
    const method = await createPaymentMethod(name, kind);
    return { method };
  });
}

/** Datos para abrir el alta rápida (➕) desde cualquier pantalla. */
export async function quickAddDataAction() {
  return run(async () => {
    const ctx = await getDataContext();
    return { data: await getQuickAddData(ctx), today: todayIso() };
  });
}
