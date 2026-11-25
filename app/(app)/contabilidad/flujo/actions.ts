"use server";

import { saveFlow } from "@/lib/data";

/** Guarda el diagrama del flujo de dinero (sección compartida). */
export async function saveFlowAction(
  doc: unknown,
  baseUpdatedAt: string | null,
): Promise<{ ok: true; updatedAt: string } | { ok: false; conflict?: true; error?: string }> {
  try {
    if (baseUpdatedAt !== null && (typeof baseUpdatedAt !== "string" || baseUpdatedAt.length > 64)) {
      throw new Error("Datos no válidos.");
    }
    return await saveFlow(doc, baseUpdatedAt);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "";
    if (/row-level security|permission denied/i.test(message)) {
      return { ok: false, error: "Sin permiso para guardar el diagrama (falta el script 14)." };
    }
    return { ok: false, error: message || "No se pudo guardar." };
  }
}
