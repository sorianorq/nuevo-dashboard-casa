import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FlowDoc, STARTER_FLOW } from "@/lib/flow/model";
import { getSession } from "./session";

/**
 * Flujo de dinero (sección compartida: cualquier rol). Una sola fila
 * `money_flow` (id = 'casa') con el diagrama en JSON. Al guardar se comprueba
 * que nadie lo haya cambiado desde que se abrió (updated_at).
 */

export type FlowData = {
  doc: FlowDoc;
  /** null = aún no se ha guardado (se ve el diagrama de partida). */
  updatedAt: string | null;
  /** true si lo guardó por última vez quien lo está viendo (null si no se sabe). */
  updatedByMe: boolean | null;
};

const dbError = (e: { message: string }) => new Error(`Error de base de datos: ${e.message}`);
const missingTable = (m: string) => /money_flow/.test(m) && /does not exist|schema cache/i.test(m);

export async function getFlow(): Promise<FlowData> {
  const session = await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.from("money_flow").select("data, updated_at, updated_by").eq("id", "casa").maybeSingle();
  if (error) {
    if (missingTable(error.message)) throw new Error("Falta ejecutar el script 14 (flujo de dinero).");
    throw dbError(error);
  }
  if (!data) return { doc: STARTER_FLOW, updatedAt: null, updatedByMe: null };
  const parsed = FlowDoc.safeParse(data.data);
  return {
    doc: parsed.success ? parsed.data : STARTER_FLOW,
    updatedAt: String(data.updated_at),
    updatedByMe: data.updated_by ? data.updated_by === session.userId : null,
  };
}

/**
 * Guarda el diagrama. `baseUpdatedAt` es la versión que se abrió: si en la
 * base hay otra, alguien lo cambió entretanto y no se pisa (conflict).
 */
export async function saveFlow(
  doc: unknown,
  baseUpdatedAt: string | null,
): Promise<{ ok: true; updatedAt: string } | { ok: false; conflict: true }> {
  const session = await getSession();
  const parsed = FlowDoc.safeParse(doc);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Diagrama no válido.");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const row = { data: parsed.data, updated_at: now, updated_by: session.userId };

  if (baseUpdatedAt === null) {
    const { error } = await supabase.from("money_flow").insert({ id: "casa", ...row });
    if (error) {
      if (/duplicate key/i.test(error.message)) return { ok: false, conflict: true };
      throw dbError(error);
    }
    return { ok: true, updatedAt: now };
  }
  const { data, error } = await supabase
    .from("money_flow")
    .update(row)
    .eq("id", "casa")
    .eq("updated_at", baseUpdatedAt)
    .select("updated_at");
  if (error) throw dbError(error);
  if (!data?.length) return { ok: false, conflict: true };
  return { ok: true, updatedAt: String(data[0].updated_at) };
}
