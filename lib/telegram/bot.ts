import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwner, isPerson, OWNER_LABEL, type Owner, type Person } from "@/lib/balance";
import { isOthersName, OTHERS_NAME } from "@/lib/calc/pagos";
import { buildSuggester } from "@/lib/import/suggest";
import { formatDate } from "@/lib/format";
import { todayIso } from "@/lib/months";
import { answerCallback, editMessage, sendMessage, type Keyboard } from "./api";
import { parseExpense, type ParsedExpense } from "./parse";

/**
 * Bot de Telegram para apuntar gastos (decisión de Ricardo, 20/11/2026).
 *
 *  1. Mensaje libre → Claude entiende importe, descripción, fecha, Amex y
 *     medio de pago (parse.ts).
 *  2. Botones: ¿a qué Balance? (Casa · Ricardo · Andrea).
 *  3. Si no es Amex y no se dijo el medio de pago: botones con los suyos.
 *  4. Concepto: botones con los conceptos de gastos de ese Balance tal como
 *     están en la app (los que ofrece el formulario de gastos a mano), con el
 *     sugerido arriba (⭐) y los grupos (subtotales) que se abren. Si solo hay
 *     uno, se usa sin preguntar.
 *  5. Se guarda en amex_expenses (pendiente de traspaso si es Amex y no va a
 *     Casa). Botón «Deshacer».
 *
 * Solo atiende a los usuarios de TELEGRAM_USERS («idTelegram:persona,…»).
 * Escribe con la clave de servicio (sin sesión): las reglas van aquí.
 */

const APP_URL = process.env.APP_URL ?? "https://nuevo-dashboard-casa.vercel.app";
const OWNERS_ORDER: Owner[] = ["casa", "ricardo", "andrea"];

type How = { amex: boolean; methodId: string | null };

type Pending = {
  id: string;
  chat_id: number;
  person: Person;
  /** Lo entendido del mensaje y, tras los botones, cómo se pagó. */
  payload: ParsedExpense & { amount: number; how?: How };
  owner: Owner | null;
  expense_id: string | null;
};

/** Persona de un usuario de Telegram, según TELEGRAM_USERS. */
function personOf(telegramId: number): Person | null {
  for (const pair of (process.env.TELEGRAM_USERS ?? "").split(",")) {
    const [id, person] = pair.split(":").map((s) => s.trim());
    if (id === String(telegramId) && isPerson(person)) return person;
  }
  return null;
}

const money = (n: number) =>
  `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })} €`;

function summary(p: Pending["payload"]) {
  return `${money(p.amount)} · ${p.description || "Sin descripción"} · ${formatDate(p.date)}${p.amex ? " · Amex" : ""}`;
}

const HELP = [
  "Escríbeme un gasto y lo apunto en Finanzas Casa. Por ejemplo:",
  "• 25,50 Mercadona amex",
  "• ayer 12 € parking",
  "• gasolina 60 bankinter 18/11",
  "",
  "Te preguntaré a qué Balance va (Casa, Ricardo o Andrea) y, si no es con la Amex, con qué se pagó.",
].join("\n");

// --- Entrada ---------------------------------------------------------------

type TgUser = { id: number };
type TgMessage = { message_id: number; chat: { id: number }; from?: TgUser; text?: string };
type TgCallback = { id: string; from: TgUser; data?: string; message?: TgMessage };
export type TgUpdate = { message?: TgMessage; callback_query?: TgCallback };

export async function handleUpdate(update: TgUpdate) {
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  try {
    if (update.callback_query) return await handleCallback(update.callback_query);
    if (update.message) return await handleMessage(update.message);
  } catch (e) {
    console.error("Bot de Telegram:", e);
    if (chatId) await sendMessage(chatId, "Algo ha fallado y no he podido apuntarlo. Inténtalo de nuevo en un momento.");
  }
}

async function handleMessage(msg: TgMessage) {
  const chatId = msg.chat.id;
  const from = msg.from?.id;
  if (!from) return;
  const person = personOf(from);
  if (!person) {
    // Para darte de alta: este es el número que hay que poner en TELEGRAM_USERS.
    await sendMessage(chatId, `No estás autorizado para usar este bot. Tu id de Telegram es ${from}.`);
    return;
  }
  const text = (msg.text ?? "").trim();
  if (!text || text === "/start" || text === "/ayuda" || text === "/help") {
    await sendMessage(chatId, HELP);
    return;
  }
  if (text.length > 500) {
    await sendMessage(chatId, "El mensaje es demasiado largo. Escribe solo el gasto: importe, qué es y, si quieres, la fecha.");
    return;
  }

  const parsed = await parseExpense(text, todayIso());
  const amount = parsed.amount === null ? NaN : Math.round(parsed.amount * 100) / 100;
  if (!parsed.understood || !Number.isFinite(amount) || amount <= 0 || amount >= 1e6 || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
    await sendMessage(chatId, parsed.question ?? "No lo he entendido. Escribe el importe y qué es, por ejemplo: «25,50 Mercadona amex».");
    return;
  }

  const db = createAdminClient();
  const payload = { ...parsed, amount, description: parsed.description.trim().slice(0, 120) };
  const { data, error } = await db
    .from("telegram_pending")
    .insert({ chat_id: chatId, person, payload })
    .select("id")
    .single();
  if (error) throw new Error(`telegram_pending: ${error.message}`);
  await sendMessage(chatId, `${summary(payload)}\n\n¿A qué Balance va?`, balanceKeyboard(String(data.id)));
}

function balanceKeyboard(pendingId: string): Keyboard {
  return [
    OWNERS_ORDER.map((o) => ({ text: OWNER_LABEL[o], callback_data: `b:${pendingId}:${o}` })),
    [{ text: "Cancelar", callback_data: `x:${pendingId}` }],
  ];
}

// --- Botones ---------------------------------------------------------------

async function handleCallback(cq: TgCallback) {
  const msg = cq.message;
  const person = personOf(cq.from.id);
  if (!msg || !person || !cq.data) {
    await answerCallback(cq.id, "No autorizado.");
    return;
  }
  const [kind, pendingId, arg] = cq.data.split(":");
  const db = createAdminClient();
  const { data: row } = await db.from("telegram_pending").select("*").eq("id", pendingId).maybeSingle();
  const pending = row as Pending | null;
  // Solo quien lo escribió, en su chat.
  if (!pending || pending.chat_id !== msg.chat.id || pending.person !== person) {
    await answerCallback(cq.id, "Este gasto ya no está disponible.");
    return;
  }
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  if (kind === "x") {
    if (!pending.expense_id) await db.from("telegram_pending").delete().eq("id", pending.id);
    await editMessage(chatId, messageId, `${summary(pending.payload)}\n\nCancelado: no se ha guardado.`);
    await answerCallback(cq.id);
    return;
  }

  if (kind === "u") {
    if (pending.expense_id) {
      const { error } = await db.from("amex_expenses").delete().eq("id", pending.expense_id);
      if (error) {
        await answerCallback(cq.id, "No se pudo deshacer.");
        return;
      }
      await db.from("telegram_pending").update({ expense_id: null }).eq("id", pending.id);
    }
    await editMessage(chatId, messageId, `${summary(pending.payload)}\n\nDeshecho: el gasto se ha borrado.`);
    await answerCallback(cq.id, "Gasto borrado");
    return;
  }

  if (pending.expense_id) {
    await answerCallback(cq.id, "Ya está guardado.");
    return;
  }

  if (kind === "b") {
    if (!isOwner(arg)) return answerCallback(cq.id);
    await db.from("telegram_pending").update({ owner: arg }).eq("id", pending.id);
    pending.owner = arg;
    if (pending.payload.amex) return chooseHow(pending, { amex: true, methodId: null }, chatId, messageId, cq.id);

    // Sin Amex: medio de pago de quien escribe.
    const methods = await paymentMethods(person);
    const said = pending.payload.payment_method?.toLowerCase().trim();
    const match = said ? methods.find((m) => m.name.toLowerCase().includes(said) || said.includes(m.name.toLowerCase())) : undefined;
    if (match) return chooseHow(pending, { amex: false, methodId: match.id }, chatId, messageId, cq.id);

    const rows: Keyboard = [];
    const buttons = [
      ...methods.map((m, i) => ({ text: m.name, callback_data: `m:${pending.id}:${i}` })),
      { text: "Amex", callback_data: `m:${pending.id}:amex` },
    ];
    for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
    rows.push([{ text: "Cancelar", callback_data: `x:${pending.id}` }]);
    await editMessage(chatId, messageId, `${summary(pending.payload)} → ${OWNER_LABEL[arg]}\n\n¿Con qué se pagó?`, rows);
    await answerCallback(cq.id);
    return;
  }

  if (kind === "m" && pending.owner) {
    if (arg === "amex") return chooseHow(pending, { amex: true, methodId: null }, chatId, messageId, cq.id);
    const methods = await paymentMethods(person);
    const m = methods[Number(arg)];
    if (!m) return answerCallback(cq.id, "Ese medio de pago ya no existe.");
    return chooseHow(pending, { amex: false, methodId: m.id }, chatId, messageId, cq.id);
  }

  // Selector de concepto: abrir un grupo («g:id:n»), volver («g:id:-») o elegir («c:id:n»).
  if (kind === "g" && pending.owner && pending.payload.how) {
    return askConcept(pending, chatId, messageId, cq.id, arg === "-" ? null : Number(arg));
  }
  if (kind === "c" && pending.owner && pending.payload.how) {
    const menu = await conceptMenu(pending.owner, pending.payload.description);
    const c = menu.concepts[Number(arg)];
    if (!c) return answerCallback(cq.id, "Ese concepto ya no existe.");
    return save(pending, { id: c.id, name: c.name }, chatId, messageId, cq.id);
  }

  await answerCallback(cq.id);
}

/** Guarda cómo se pagó y pasa a elegir el concepto. */
async function chooseHow(pending: Pending, how: How, chatId: number, messageId: number, callbackId: string) {
  const db = createAdminClient();
  pending.payload = { ...pending.payload, how };
  await db.from("telegram_pending").update({ payload: pending.payload }).eq("id", pending.id);
  return askConcept(pending, chatId, messageId, callbackId, null);
}

type MenuConcept = { id: string; name: string; parentId: string | null };
type Menu = {
  /** Conceptos elegibles, en el orden de la app (el índice va en el botón). */
  concepts: MenuConcept[];
  /** Primer nivel: grupo (subtotal con conceptos elegibles) o concepto suelto. */
  top: ({ kind: "group"; index: number; name: string; children: number[] } | { kind: "concept"; index: number })[];
  /** Índice del sugerido por gastos parecidos (o null). */
  suggested: number | null;
};

/**
 * Conceptos de gastos del Balance tal como están en la app: los que ofrece el
 * formulario de gastos a mano (enlazados a Pagos o con pagos_visible, sin
 * archivar), con sus grupos y el sugerido.
 */
export async function conceptMenu(owner: Owner, description: string): Promise<Menu> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("andrea_concepts")
    .select("id, concept, kind, link_source, pagos_visible, archived, section, sort_order, parent_id")
    .eq("owner", owner)
    .eq("section", "gastos");
  if (error) throw new Error(`andrea_concepts: ${error.message}`);
  const rows = (data ?? [])
    .filter((c) => !c.archived)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.concept).localeCompare(String(b.concept), "es"));
  const groupIds = new Set(rows.filter((c) => c.kind === "subtotal").map((c) => String(c.id)));
  const concepts: MenuConcept[] = rows
    .filter((c) => c.kind === "linked" && (c.link_source === "pagos" || c.pagos_visible === true))
    .map((c) => ({ id: String(c.id), name: String(c.concept), parentId: c.parent_id && groupIds.has(String(c.parent_id)) ? String(c.parent_id) : null }));

  const top: Menu["top"] = [];
  // Recorre en el orden de la app: un grupo aparece donde está su subtotal.
  for (const r of rows) {
    const id = String(r.id);
    if (r.kind === "subtotal") {
      const children = concepts.map((c, i) => (c.parentId === id ? i : -1)).filter((i) => i >= 0);
      if (children.length) {
        top.push({ kind: "group", index: top.length, name: String(r.concept), children });
      }
    } else {
      const i = concepts.findIndex((c) => c.id === id);
      if (i >= 0 && concepts[i].parentId === null) top.push({ kind: "concept", index: i });
    }
  }

  let suggested: number | null = null;
  if (description && concepts.length) {
    const ids = new Set(concepts.map((c) => c.id));
    const { data: history } = await db
      .from("amex_expenses")
      .select("concept, concept_id, expense_date")
      .not("concept_id", "is", null)
      .is("purchase_id", null)
      .order("expense_date", { ascending: false })
      .limit(3000);
    const hit = buildSuggester(
      (history ?? [])
        .filter((h) => ids.has(String(h.concept_id)) && typeof h.concept === "string" && h.concept.trim())
        .map((h) => ({ description: String(h.concept), conceptId: String(h.concept_id), date: String(h.expense_date) })),
    )(description);
    if (hit) suggested = concepts.findIndex((c) => c.id === hit.conceptId);
    if (suggested !== null && suggested < 0) suggested = null;
  }
  return { concepts, top, suggested };
}

/** Pregunta el concepto (primer nivel, o los de un grupo). */
async function askConcept(pending: Pending, chatId: number, messageId: number, callbackId: string, group: number | null) {
  const owner = pending.owner as Owner;
  const menu = await conceptMenu(owner, pending.payload.description);
  // Ninguno elegible: «Otros gastos» (se crea o recupera). Uno solo: ese.
  if (menu.concepts.length === 0) return save(pending, await conceptFor(owner, ""), chatId, messageId, callbackId);
  if (menu.concepts.length === 1) return save(pending, menu.concepts[0], chatId, messageId, callbackId);

  const pid = pending.id;
  const conceptButton = (i: number, star = false) => ({ text: `${star ? "⭐ " : ""}${menu.concepts[i].name}`, callback_data: `c:${pid}:${i}` });
  const buttons: { text: string; callback_data: string }[] = [];
  const rows: Keyboard = [];
  let title = "¿Qué concepto?";

  const g = group !== null ? menu.top[group] : undefined;
  if (g && g.kind === "group") {
    title = `${g.name}: ¿qué concepto?`;
    for (const i of g.children) buttons.push(conceptButton(i));
  } else {
    if (menu.suggested !== null) rows.push([conceptButton(menu.suggested, true)]);
    for (const t of menu.top) {
      buttons.push(t.kind === "group" ? { text: `${t.name} ›`, callback_data: `g:${pid}:${t.index}` } : conceptButton(t.index));
    }
  }
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push(
    g
      ? [{ text: "‹ Volver", callback_data: `g:${pid}:-` }, { text: "Cancelar", callback_data: `x:${pid}` }]
      : [{ text: "Cancelar", callback_data: `x:${pid}` }],
  );
  const how = pending.payload.how;
  const paid = how?.amex ? "Amex" : "sin Amex";
  await editMessage(chatId, messageId, `${summary(pending.payload)} → ${OWNER_LABEL[owner]} · ${paid}\n\n${title}`, rows);
  await answerCallback(callbackId);
}

async function paymentMethods(person: Person) {
  const db = createAdminClient();
  const { data } = await db
    .from("payment_methods")
    .select("id, name, archived, sort_order")
    .eq("owner", person)
    .order("sort_order", { ascending: true })
    .order("name");
  return (data ?? []).filter((m) => !m.archived).map((m) => ({ id: String(m.id), name: String(m.name) }));
}

// --- Guardar ---------------------------------------------------------------

/** Concepto: el sugerido por gastos parecidos dentro del Balance; si no, «Otros gastos». */
async function conceptFor(owner: Owner, description: string): Promise<{ id: string; name: string }> {
  const db = createAdminClient();
  const { data: concepts, error } = await db
    .from("andrea_concepts")
    .select("id, concept, kind, link_source, pagos_visible, archived, section, sort_order")
    .eq("owner", owner);
  if (error) throw new Error(`andrea_concepts: ${error.message}`);
  const usable = (concepts ?? []).filter(
    (c) => !c.archived && c.kind === "linked" && (c.link_source === "pagos" || c.pagos_visible === true),
  );
  const ids = new Set(usable.map((c) => String(c.id)));

  const { data: history } = await db
    .from("amex_expenses")
    .select("concept, concept_id, expense_date")
    .not("concept_id", "is", null)
    .is("purchase_id", null)
    .order("expense_date", { ascending: false })
    .limit(3000);
  const suggest = buildSuggester(
    (history ?? [])
      .filter((h) => ids.has(String(h.concept_id)) && typeof h.concept === "string" && h.concept.trim())
      .map((h) => ({ description: String(h.concept), conceptId: String(h.concept_id), date: String(h.expense_date) })),
  );
  const hit = description ? suggest(description) : null;
  const found = hit && usable.find((c) => String(c.id) === hit.conceptId);
  if (found) return { id: String(found.id), name: String(found.concept) };

  const others = usable.find((c) => isOthersName(String(c.concept)));
  if (others) return { id: String(others.id), name: String(others.concept) };

  // Sin «Otros gastos» de Pagos: se recupera si existe (archivado) o se crea.
  const existing = (concepts ?? []).find((c) => isOthersName(String(c.concept)));
  if (existing) {
    await db
      .from("andrea_concepts")
      .update({ archived: false, kind: "linked", link_source: existing.link_source ?? "pagos", pagos_visible: true })
      .eq("id", existing.id);
    return { id: String(existing.id), name: String(existing.concept) };
  }
  const sortOrder = (concepts ?? []).filter((c) => c.section === "gastos").reduce((m, c) => Math.max(m, Number(c.sort_order) || 0), 0) + 10;
  const userId = await userIdOf(owner === "casa" ? null : owner);
  const { data: created, error: createError } = await db
    .from("andrea_concepts")
    .insert({ user_id: userId, owner, concept: OTHERS_NAME, section: "gastos", kind: "linked", link_source: "pagos", parent_id: null, pagos_visible: true, sort_order: sortOrder, archived: false })
    .select("id")
    .single();
  if (createError) throw new Error(`andrea_concepts: ${createError.message}`);
  return { id: String(created.id), name: OTHERS_NAME };
}

/** user_id de la persona (o del admin si no se indica): las filas de la app lo llevan. */
async function userIdOf(person: Person | null): Promise<string> {
  const db = createAdminClient();
  const { data } = await db.from("user_roles").select("user_id, role").in("role", person ? [person] : ["admin", "ricardo", "andrea"]);
  const row = (data ?? []).find((r) => (person ? r.role === person : r.role === "admin")) ?? data?.[0];
  if (!row) throw new Error("No encuentro el usuario de la app para este gasto.");
  return String(row.user_id);
}

async function save(
  pending: Pending,
  concept: { id: string; name: string },
  chatId: number,
  messageId: number,
  callbackId: string,
) {
  const owner = pending.owner as Owner;
  const p = pending.payload;
  const how: How = p.how ?? { amex: p.amex, methodId: null };
  const db = createAdminClient();
  // Con Amex: consta la persona del Balance (en Casa, quien escribe). Sin Amex: quien escribe.
  const paidBy: Person = how.amex && isPerson(owner) ? owner : pending.person;
  const { data, error } = await db
    .from("amex_expenses")
    .insert({
      user_id: await userIdOf(pending.person),
      expense_date: p.date,
      concept: p.description || "Sin descripción",
      amount: p.amount,
      paid_by: paidBy,
      wallet: how.amex ? "amex" : pending.person,
      payment_method_id: how.amex ? null : how.methodId,
      concept_id: concept.id,
      pending: how.amex && owner !== "casa",
      comments: "Apuntado desde Telegram",
    })
    .select("id")
    .single();
  if (error) {
    console.error(error);
    await answerCallback(callbackId, "No se pudo guardar.");
    await sendMessage(chatId, `No se pudo guardar el gasto: ${error.message}`);
    return;
  }
  await db.from("telegram_pending").update({ expense_id: data.id }).eq("id", pending.id);

  const where = how.amex ? `Amex${owner !== "casa" ? " · pendiente de traspaso" : ""}` : "sin Amex";
  await editMessage(
    chatId,
    messageId,
    `✅ Guardado\n${money(p.amount)} · ${p.description || "Sin descripción"}\n${OWNER_LABEL[owner]} › ${concept.name} · ${formatDate(p.date)} · ${where}`,
    [
      [
        { text: "Deshacer", callback_data: `u:${pending.id}` },
        { text: "Ver en la app", url: `${APP_URL}/movimientos${owner === "casa" ? "" : "?balance=personal"}` },
      ],
    ],
  );
  await answerCallback(callbackId, "Guardado");
}
