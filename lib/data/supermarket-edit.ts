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

export type PaidBy = "andrea" | "ricardo";

export type PurchaseInput = {
  date: string;
  store: string;
  payment: PaymentType;
  /** Solo Amex: quién la pagó (Andrea o Ricardo; decisión de Ricardo, 18/11/2026). */
  paidBy: PaidBy;
  lines: { catId: string; amount: number }[];
  /**
   * Ticket leído de una foto (null = compra sin ticket). Si lo hay, las
   * líneas por categoría salen de sus líneas. `path`: la foto ya guardada de
   * esta compra o la que se acaba de subir (pending/…).
   */
  ticket?: { path: string; lines: TicketLine[] } | null;
};

export type TicketLine = { text: string; amount: number; catId: string };

const BUCKET = "tickets";
const PENDING = /^pending\/[0-9a-f-]{36}\.jpg$/;
const SAVED = /^compras\/[0-9a-zA-Z-]{1,40}\.jpg$/;

const dbError = (e: { message: string }) => new Error(`Error de base de datos: ${e.message}`);
const ticketColumnError = (e: { message: string }) =>
  /ticket_(path|lines)/.test(e.message) ? new Error("Falta ejecutar el script 15 (fotos de tickets).") : dbError(e);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function clean(input: PurchaseInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) throw new Error("Fecha no válida.");
  const year = Number(input.date.slice(0, 4));
  if (year < 2000 || year > 2100) throw new Error("Fecha no válida.");
  const store = input.store.trim().replace(/\s+/g, " ");
  if (!store) throw new Error("Escribe la tienda.");
  if (store.length > 80) throw new Error("El nombre de la tienda es demasiado largo.");
  if (!PAYMENT_TYPES.includes(input.payment)) throw new Error("Forma de pago no válida.");
  if (!["andrea", "ricardo"].includes(input.paidBy)) throw new Error("Elige quién la pagó: Andrea o Ricardo.");
  const ticket = input.ticket ? cleanTicket(input.ticket) : null;
  if (ticket) {
    // Las categorías salen de las líneas del ticket.
    const sums = new Map<string, number>();
    for (const l of ticket.lines) sums.set(l.catId, round2((sums.get(l.catId) ?? 0) + l.amount));
    const bad = [...sums].find(([, v]) => v <= 0);
    if (bad) throw new Error(`«${SUPER_CATEGORY_NAME[bad[0]]}» queda en 0 o en negativo: revisa los descuentos del ticket.`);
    input = { ...input, lines: [...sums].map(([catId, amount]) => ({ catId, amount })) };
  }
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
  return { store, items, total, ticket };
}

function cleanTicket(t: { path: string; lines: TicketLine[] }) {
  if (typeof t.path !== "string" || !(PENDING.test(t.path) || SAVED.test(t.path))) throw new Error("Foto del ticket no válida.");
  if (!Array.isArray(t.lines) || t.lines.length === 0) throw new Error("El ticket no tiene líneas.");
  if (t.lines.length > 200) throw new Error("Demasiadas líneas en el ticket.");
  const lines = t.lines.map((l) => {
    if (!l || typeof l.text !== "string" || !(l.catId in SUPER_CATEGORY_NAME)) throw new Error("Línea del ticket no válida.");
    if (typeof l.amount !== "number" || !Number.isFinite(l.amount) || Math.abs(l.amount) >= 1e5 || l.amount === 0) {
      throw new Error(`Importe no válido en «${l.text.slice(0, 40)}».`);
    }
    return { text: l.text.trim().replace(/\s+/g, " ").slice(0, 120) || "(sin texto)", amount: round2(l.amount), catId: l.catId };
  });
  return { path: t.path, lines };
}

// --- Foto del ticket (almacén privado «tickets», script 15) ----------------

const storageError = (e: { message: string }) =>
  /bucket not found|not found/i.test(e.message)
    ? new Error("Falta ejecutar el script 15 (fotos de tickets).")
    : /row-level security|unauthorized|permission/i.test(e.message)
      ? new Error("Sin permiso para guardar la foto (falta el script 15).")
      : new Error(`Error al guardar la foto: ${e.message}`);

/** Sube la foto recién hecha (pendiente hasta que se guarde la compra). */
export async function uploadPendingTicket(bytes: ArrayBuffer): Promise<string> {
  await getSession();
  const supabase = await createClient();
  const path = `pending/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw storageError(error);
  // Limpieza: fotos pendientes de hace más de un día (lecturas que no se guardaron).
  void (async () => {
    const { data } = await supabase.storage.from(BUCKET).list("pending", { limit: 100 });
    const old = (data ?? [])
      .filter((f) => f.created_at && Date.now() - Date.parse(f.created_at) > 86_400_000)
      .map((f) => `pending/${f.name}`);
    if (old.length) await supabase.storage.from(BUCKET).remove(old);
  })().catch(() => {});
  return path;
}

export async function removeTicketPhoto(path: string) {
  if (!(PENDING.test(path) || SAVED.test(path))) return;
  const supabase = await createClient();
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Enlace temporal (1 h) para ver la foto de un ticket. */
export async function ticketPhotoUrl(path: string): Promise<string> {
  await getSession();
  if (!(PENDING.test(path) || SAVED.test(path))) throw new Error("Foto no válida.");
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw storageError(error);
  return data.signedUrl;
}

/** Deja la foto de la compra en compras/<id>.jpg y devuelve su ruta. */
async function placeTicket(purchaseId: string, path: string): Promise<string> {
  const target = `compras/${purchaseId}.jpg`;
  if (path === target) return target;
  if (!PENDING.test(path)) throw new Error("Foto del ticket no válida.");
  const supabase = await createClient();
  await supabase.storage.from(BUCKET).remove([target]);
  const { error } = await supabase.storage.from(BUCKET).move(path, target);
  if (error) throw storageError(error);
  return target;
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
    // La compra con Amex la paga Casa: sin traspaso (decisión de Ricardo, 23/11/2026).
    paid_by: "otros",
    pending: false,
    wallet: "amex",
    concept_id: await compraConceptId(),
  };
  if (ids.length) {
    const { error: upError } = await supabase.from("amex_expenses").update(fields).in("id", ids);
    if (upError) throw dbError(upError);
  } else {
    const { error: insError } = await supabase
      .from("amex_expenses")
      .insert({ ...fields, user_id: userId, purchase_id: purchaseId });
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
      ...(c.ticket ? { ticket_lines: c.ticket.lines } : {}),
    })
    .select("id")
    .single();
  if (error) throw ticketColumnError(error);
  const id = String(data.id);
  try {
    if (c.ticket) {
      const path = await placeTicket(id, c.ticket.path);
      const { error: tErr } = await supabase.from("supermarket_purchases").update({ ticket_path: path }).eq("id", id);
      if (tErr) throw dbError(tErr);
    }
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
  const { data: before, error: beforeError } = await supabase
    .from("supermarket_purchases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (beforeError) throw dbError(beforeError);
  if (!before) throw new Error("No se encontró la compra (o no hay permiso para cambiarla).");
  const oldPath = typeof before.ticket_path === "string" ? before.ticket_path : null;
  const ticketPath = c.ticket ? await placeTicket(id, c.ticket.path) : null;
  const { data, error } = await supabase
    .from("supermarket_purchases")
    .update({
      purchase_date: input.date,
      store_name: c.store,
      payment_type: input.payment,
      total: c.total,
      items: c.items,
      // Sin las columnas del script 15 solo se tocan si hay o había ticket.
      ...(c.ticket || oldPath ? { ticket_path: ticketPath, ticket_lines: c.ticket?.lines ?? null } : {}),
    })
    .eq("id", id)
    .select("id");
  if (error) throw ticketColumnError(error);
  if (!data?.length) throw new Error("No se encontró la compra (o no hay permiso para cambiarla).");
  if (oldPath && oldPath !== ticketPath) await removeTicketPhoto(oldPath);
  await syncAmex(session.userId, id, input, c);
}

export async function deletePurchase(id: string) {
  await getSession();
  const supabase = await createClient();
  const { error: amexError } = await supabase.from("amex_expenses").delete().eq("purchase_id", id);
  if (amexError) throw dbError(amexError);
  const { data, error } = await supabase.from("supermarket_purchases").delete().eq("id", id).select("*");
  if (error) throw dbError(error);
  if (!data?.length) throw new Error("No se encontró la compra (o no hay permiso para borrarla).");
  const path = data[0].ticket_path;
  if (typeof path === "string") await removeTicketPhoto(path);
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
