import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SUPER_CATEGORY_NAME, PAYMENT_TYPES, type PaymentType } from "@/lib/labels";
import { getSession } from "./session";
import { fetchAll } from "./query";

/**
 * Altas y cambios de Supermercado (sección compartida: cualquier rol).
 * Una compra pagada con Amex tiene su gasto en `amex_expenses` (Pagos ·
 * American Express) enlazado por `purchase_id`, con concepto Casa › Compra:
 * se crea, actualiza y borra junto con la compra (decisión de Ricardo,
 * 18/11/2026). En el Balance cuenta una sola vez, en «Compra».
 */

export type PaidBy = "otros" | "andrea" | "ricardo";

export type PurchaseInput = {
  date: string;
  store: string;
  payment: PaymentType;
  /** Solo Amex: quién la pagó (por defecto, otros = Casa). */
  paidBy: PaidBy;
  lines: { catId: string; amount: number }[];
};

const dbError = (e: { message: string }) => new Error(`Error de base de datos: ${e.message}`);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function clean(input: PurchaseInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) throw new Error("Fecha no válida.");
  const year = Number(input.date.slice(0, 4));
  if (year < 2000 || year > 2100) throw new Error("Fecha no válida.");
  const store = input.store.trim().replace(/\s+/g, " ");
  if (!store) throw new Error("Escribe la tienda.");
  if (store.length > 80) throw new Error("El nombre de la tienda es demasiado largo.");
  if (!PAYMENT_TYPES.includes(input.payment)) throw new Error("Forma de pago no válida.");
  if (!["otros", "andrea", "ricardo"].includes(input.paidBy)) throw new Error("«Pagado por» no válido.");
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error("Añade al menos una línea.");
  if (input.lines.length > 50) throw new Error("Demasiadas líneas.");

  // Repetir categoría suma a su línea (especificación funcional 5.5).
  const byCat = new Map<string, number>();
  for (const l of input.lines) {
    if (!(l.catId in SUPER_CATEGORY_NAME)) throw new Error("Categoría no válida.");
    if (typeof l.amount !== "number" || !Number.isFinite(l.amount) || l.amount <= 0 || l.amount >= 1e6) {
      throw new Error("Importe de línea no válido.");
    }
    byCat.set(l.catId, round2((byCat.get(l.catId) ?? 0) + l.amount));
  }
  const items = [...byCat].map(([catId, amount]) => ({ catId, amount, concept: SUPER_CATEGORY_NAME[catId] }));
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  return { store, items, total };
}

/** Concepto Casa › Compra (el de Casa con origen Supermercado). */
async function compraConceptId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("andrea_concepts")
    .select("id")
    .eq("owner", "casa")
    .eq("kind", "linked")
    .eq("link_source", "supermercado")
    .eq("archived", false);
  if (error) throw dbError(error);
  return data?.length === 1 ? String(data[0].id) : null;
}

/** Crea, actualiza o borra el gasto de Amex enlazado a la compra. */
async function syncAmex(
  userId: string,
  purchaseId: string,
  input: PurchaseInput,
  c: { store: string; total: number },
) {
  const supabase = await createClient();
  const { data: linked, error } = await supabase.from("amex_expenses").select("id").eq("purchase_id", purchaseId);
  if (error) throw dbError(error);
  const ids = (linked ?? []).map((r) => String(r.id));

  if (input.payment !== "amex") {
    if (ids.length) {
      const { error: delError } = await supabase.from("amex_expenses").delete().in("id", ids);
      if (delError) throw dbError(delError);
    }
    return;
  }
  const fields = {
    expense_date: input.date,
    concept: `Supermercado · ${c.store}`,
    amount: c.total,
    paid_by: input.paidBy,
    wallet: "amex",
    concept_id: await compraConceptId(),
  };
  if (ids.length) {
    const { error: upError } = await supabase.from("amex_expenses").update(fields).in("id", ids);
    if (upError) throw dbError(upError);
  } else {
    const { error: insError } = await supabase
      .from("amex_expenses")
      .insert({ ...fields, user_id: userId, purchase_id: purchaseId, pending: true });
    if (insError) throw dbError(insError);
  }
}

export async function createPurchase(input: PurchaseInput): Promise<{ id: string }> {
  const session = await getSession();
  const c = clean(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supermarket_purchases")
    .insert({
      user_id: session.userId,
      purchase_date: input.date,
      store_name: c.store,
      payment_type: input.payment,
      total: c.total,
      items: c.items,
    })
    .select("id")
    .single();
  if (error) throw dbError(error);
  const id = String(data.id);
  try {
    await syncAmex(session.userId, id, input, c);
  } catch (e) {
    // Sin gasto de Amex no se deja la compra a medias.
    await supabase.from("supermarket_purchases").delete().eq("id", id);
    throw e;
  }
  return { id };
}

export async function updatePurchase(id: string, input: PurchaseInput) {
  const session = await getSession();
  const c = clean(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supermarket_purchases")
    .update({ purchase_date: input.date, store_name: c.store, payment_type: input.payment, total: c.total, items: c.items })
    .eq("id", id)
    .select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new Error("No se encontró la compra (o no hay permiso para cambiarla).");
  await syncAmex(session.userId, id, input, c);
}

export async function deletePurchase(id: string) {
  await getSession();
  const supabase = await createClient();
  const { error: amexError } = await supabase.from("amex_expenses").delete().eq("purchase_id", id);
  if (amexError) throw dbError(amexError);
  const { data, error } = await supabase.from("supermarket_purchases").delete().eq("id", id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new Error("No se encontró la compra (o no hay permiso para borrarla).");
}

/** Tiendas por número de compras (las habituales primero). */
export async function listStores(): Promise<string[]> {
  await getSession();
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase.from("supermarket_purchases").select("id, store_name").order("id").range(a, b),
  );
  const count = new Map<string, number>();
  for (const r of rows) {
    const s = typeof r.store_name === "string" ? r.store_name.trim() : "";
    if (s) count.set(s, (count.get(s) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([s]) => s);
}
