import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isOwner, isPerson, OWNER_LABEL, type Owner, type Person } from "@/lib/balance";
import {
  isOthersName,
  isPaidBy,
  OTHERS_NAME,
  PAYMENT_METHOD_KINDS,
  round2,
  type PaidBy,
  type PaymentMethod,
  type PaymentMethodKind,
} from "@/lib/calc/pagos";
import { getDataContext, type DataContext } from "./session";
import { fetchAll } from "./query";
import { listPagosConcepts } from "./pagos";

/**
 * Altas y cambios de Pagos (`amex_expenses`). Reglas (decisiones de Ricardo,
 * 18/11/2026):
 *  - se elige el Balance (Casa, Ricardo o Andrea) y, si se pagó con la Amex,
 *    la casilla Amex; aunque quien lo apunta no vea ese Balance (los nombres
 *    de los conceptos salen del script 08). Cambio del 18/11/2026: antes el
 *    gasto solo podía ir a Casa o al Balance de quien pagó;
 *  - `paid_by`: con Amex, la persona del Balance (en Casa, quien lo apunta);
 *    sin Amex, quien lo apunta (dueño del medio de pago). «otros» solo se
 *    conserva en gastos antiguos;
 *  - el concepto es obligatorio: si no se elige, «Otros gastos» de ese
 *    Balance (en Casa se crea la primera vez si no existe);
 *  - con Amex: `wallet = 'amex'`, sale en la lista de la Amex. Sin Amex:
 *    `wallet` = la persona y un medio de pago suyo (Pagos personales).
 * Los gastos que salen de una compra (`purchase_id`) se cambian desde Supermercado.
 */

export type PaymentInput = {
  date: string;
  description: string;
  amount: number;
  amex: boolean;
  paidBy: PaidBy;
  /** Balance del gasto: Casa, Ricardo o Andrea. */
  owner: Owner;
  /** null = «Otros gastos» de ese Balance. */
  conceptId: string | null;
  paymentMethodId: string | null;
  pending: boolean;
  comment: string;
};

const dbError = (e: { message: string }) => new Error(`Error de base de datos: ${e.message}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadExisting(id: string) {
  if (!UUID.test(id)) throw new Error("Gasto no válido.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("amex_expenses")
    .select("id, wallet, paid_by, purchase_id, concept_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new Error("No se encontró el gasto (o no hay permiso para verlo).");
  if (data.purchase_id) throw new Error("Este gasto sale de una compra: cámbialo desde Supermercado.");
  return data;
}

/** «Otros gastos» del Balance; en un Balance visible se crea si no existe. */
async function othersConcept(ctx: DataContext, owner: Owner, concepts: { id: string; owner: Owner; name: string; archived: boolean }[]) {
  const found = concepts.find((c) => c.owner === owner && !c.archived && isOthersName(c.name));
  if (found) return found.id;
  if (!ctx.allowedOwners.includes(owner)) {
    throw new Error(`No se encuentra «${OTHERS_NAME}» en el Balance de ${OWNER_LABEL[owner]}: elige un concepto.`);
  }
  const supabase = await createClient();
  // Puede existir con otro tipo o archivado: no se duplica el nombre (única owner + concepto).
  const { data: same, error: sameError } = await supabase
    .from("andrea_concepts")
    .select("id, kind, archived")
    .eq("owner", owner)
    .ilike("concept", OTHERS_NAME);
  if (sameError) throw dbError(sameError);
  if (same?.length) {
    throw new Error(`«${OTHERS_NAME}» de ${OWNER_LABEL[owner]} existe pero no es un concepto de Pagos activo: revísalo en Balances.`);
  }
  const rows = await fetchAll((a, b) =>
    supabase.from("andrea_concepts").select("id, sort_order").eq("owner", owner).eq("section", "gastos").order("id").range(a, b),
  );
  const sortOrder = rows.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) + 10;
  const { data, error } = await supabase
    .from("andrea_concepts")
    .insert({
      user_id: ctx.userId,
      owner,
      concept: OTHERS_NAME,
      section: "gastos",
      kind: "linked",
      link_source: "pagos",
      parent_id: null,
      pagos_visible: true,
      sort_order: sortOrder,
      archived: false,
    })
    .select("id")
    .single();
  if (error) throw dbError(error);
  return String(data.id);
}

function clean(input: PaymentInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) throw new Error("Fecha no válida.");
  const year = Number(input.date.slice(0, 4));
  if (year < 2000 || year > 2100) throw new Error("Fecha no válida.");
  const description = input.description.trim().replace(/\s+/g, " ");
  if (!description) throw new Error("Escribe una descripción.");
  if (description.length > 120) throw new Error("La descripción es demasiado larga.");
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount >= 1e6) {
    throw new Error("Importe no válido.");
  }
  const comment = input.comment.trim();
  if (comment.length > 500) throw new Error("El comentario es demasiado largo.");
  if (!isPaidBy(input.paidBy)) throw new Error("«Pagado por» no válido.");
  if (!isOwner(input.owner)) throw new Error("Balance no válido.");
  return { description, amount: round2(input.amount), comment: comment || null };
}

export async function savePayment(id: string | null, input: PaymentInput): Promise<{ id: string }> {
  const ctx = await getDataContext();
  const c = clean(input);
  const existing = id ? await loadExisting(id) : null;

  // Quién pagó: Andrea o Ricardo. «otros» solo si el gasto antiguo ya lo tenía.
  // «otros» = Casa, solo con la Amex (sin traspaso).
  if (input.paidBy === "otros" && !(input.amex && input.owner === "casa")) {
    throw new Error("Elige quién pagó: Andrea o Ricardo.");
  }
  // Con Amex en un Balance personal, consta como pagado por esa persona.
  if (input.amex && isPerson(input.owner) && input.paidBy !== input.owner) {
    throw new Error("Un gasto de la Amex en un Balance personal consta como pagado por esa persona.");
  }

  let wallet: string;
  let paymentMethodId: string | null = null;
  if (input.amex) {
    wallet = "amex";
  } else {
    // Pagos personales: solo los propios (admin, los de cualquiera).
    if (!isPerson(input.paidBy) || !ctx.allowedOwners.includes(input.paidBy)) {
      throw new Error("Sin Amex solo puedes apuntar tus propios pagos.");
    }
    wallet = input.paidBy;
    if (!input.paymentMethodId || !UUID.test(input.paymentMethodId)) throw new Error("Elige el medio de pago.");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payment_methods")
      .select("id")
      .eq("id", input.paymentMethodId)
      .eq("owner", input.paidBy)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new Error("Ese medio de pago no es de quien pagó.");
    paymentMethodId = input.paymentMethodId;
  }

  // Concepto obligatorio, del Balance elegido.
  const { concepts, complete } = await listPagosConcepts(ctx);
  if (!complete && !ctx.allowedOwners.includes(input.owner)) {
    throw new Error("Para apuntar en el Balance de la otra persona falta el script 08 (conceptos de Pagos).");
  }
  let conceptId: string;
  if (input.conceptId) {
    const concept = concepts.find((x) => x.id === input.conceptId);
    const keepsOld = existing && String(existing.concept_id) === input.conceptId;
    if (!concept || concept.owner !== input.owner || (concept.archived && !keepsOld)) {
      throw new Error("Ese concepto no es del Balance elegido.");
    }
    conceptId = concept.id;
  } else {
    conceptId = await othersConcept(ctx, input.owner, concepts);
  }

  const fields = {
    expense_date: input.date,
    concept: c.description,
    amount: c.amount,
    paid_by: input.paidBy,
    wallet,
    payment_method_id: paymentMethodId,
    concept_id: conceptId,
    // Pendiente de traspaso solo con la Amex y si lo paga una persona (Casa no traspasa).
    pending: input.amex && input.paidBy !== "otros" ? input.pending === true : false,
    comments: c.comment,
  };
  const supabase = await createClient();
  if (existing) {
    const { data, error } = await supabase.from("amex_expenses").update(fields).eq("id", existing.id).select("id");
    if (error) throw dbError(error);
    if (!data?.length) throw new Error("No se pudo cambiar el gasto (sin permiso).");
    return { id: String(existing.id) };
  }
  const { data, error } = await supabase
    .from("amex_expenses")
    .insert({ ...fields, user_id: ctx.userId })
    .select("id")
    .single();
  if (error) throw dbError(error);
  return { id: String(data.id) };
}

export async function deletePayment(id: string) {
  await getDataContext();
  const existing = await loadExisting(id);
  const supabase = await createClient();
  const { data, error } = await supabase.from("amex_expenses").delete().eq("id", existing.id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new Error("No se pudo borrar el gasto (sin permiso).");
}

/** «Marcar como traspasados»: quita la marca de pendiente a gastos de la Amex. */
export async function markTransferred(ids: string[]): Promise<number> {
  await getDataContext();
  const clean = [...new Set(ids)].filter((id) => UUID.test(id));
  if (!clean.length || clean.length !== ids.length || clean.length > 500) throw new Error("Selección no válida.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("amex_expenses")
    .update({ pending: false })
    .in("id", clean)
    .eq("wallet", "amex")
    .eq("pending", true)
    .select("id");
  if (error) throw dbError(error);
  return data?.length ?? 0;
}

/** «+ Nuevo» medio de pago de una persona (la propia; admin, cualquiera). */
export async function createPaymentMethod(name: string, kind: PaymentMethodKind, person: Person): Promise<PaymentMethod> {
  const ctx = await getDataContext();
  if (!isPerson(person) || !ctx.allowedOwners.includes(person)) throw new Error("Solo puedes crear tus propios medios de pago.");
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Escribe el nombre del medio de pago.");
  if (clean.length > 40) throw new Error("El nombre es demasiado largo.");
  if (!PAYMENT_METHOD_KINDS.includes(kind)) throw new Error("Tipo no válido.");
  const supabase = await createClient();
  const { data: same, error: sameError } = await supabase
    .from("payment_methods")
    .select("id, name, kind, archived, sort_order")
    .eq("owner", person);
  if (sameError) throw dbError(sameError);
  const dup = (same ?? []).find((m) => String(m.name).toLowerCase() === clean.toLowerCase());
  if (dup) {
    if (dup.archived) throw new Error("Ya existe con ese nombre, archivado.");
    throw new Error("Ya tienes un medio de pago con ese nombre.");
  }
  const sortOrder = (same ?? []).reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) + 10;
  const { data, error } = await supabase
    .from("payment_methods")
    .insert({ owner: person, name: clean, kind, sort_order: sortOrder, archived: false })
    .select("id")
    .single();
  if (error) throw dbError(error);
  return { id: String(data.id), name: clean, kind, archived: false };
}
