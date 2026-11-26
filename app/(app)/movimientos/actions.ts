"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import {
  applyConceptToMany,
  conceptHistory,
  createAccount,
  createConcept,
  deleteAccount,
  existingImportKeys,
  findSimilar,
  getDataContext,
  getTemplate,
  insertTransactions,
  listConcepts,
  saveTemplate,
  setTransactionConcept,
  setTransactionFlow,
  manualConflicts,
  setManualAmount,
  bankLinkFor,
  lastTransactionDay,
  markSynced,
} from "@/lib/data";
import { BankError, fetchTransactions, toParsedRows } from "@/lib/banking/enable-banking";
import { parseBalanceTab } from "@/lib/balance";
import { importHash } from "@/lib/import/hash";
import { duplicateKey, type ImportTemplate, type ParsedRow } from "@/lib/import/normalize";
import { buildSuggester } from "@/lib/import/suggest";
import {
  ACCOUNT_TYPES,
  SECTION_ORDER,
  isFlow,
  type Account,
  type AccountType,
  type ConceptOption,
  type ConceptSection,
  type Flow,
} from "@/lib/labels";

/**
 * Acciones de Movimientos y Cargar extracto. Cada una vuelve a leer la
 * sesión y resuelve el Balance en el servidor a partir de la pestaña
 * (casa | personal): el navegador nunca elige usuario ni owner directamente.
 */

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function ctxFor(tab: unknown) {
  return getDataContext({ balance: parseBalanceTab(tab) });
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo completar la acción." };
  }
}

// uuid, o entero por si alguna tabla antigua usa ids numéricos.
const isId = (v: unknown): v is string =>
  typeof v === "string" && (/^[0-9a-f-]{36}$/i.test(v) || /^\d{1,18}$/.test(v));

// --- Movimientos ------------------------------------------------------------

export type SimilarTx = { id: string; date: string; description: string; amount: number };

export async function changeConcept(tab: string, txId: string, conceptId: string | null) {
  return run(async () => {
    if (!isId(txId) || (conceptId !== null && !isId(conceptId))) throw new Error("Datos no válidos.");
    const ctx = await ctxFor(tab);
    const tx = await setTransactionConcept(ctx, txId, conceptId);
    const similar: SimilarTx[] = conceptId ? await findSimilar(ctx, tx, conceptId) : [];
    refresh();
    return { similar };
  });
}

export async function applyToSimilar(tab: string, ids: string[], conceptId: string) {
  return run(async () => {
    if (!Array.isArray(ids) || ids.length > 2000 || !ids.every(isId) || !isId(conceptId)) {
      throw new Error("Datos no válidos.");
    }
    const ctx = await ctxFor(tab);
    const updated = await applyConceptToMany(ctx, ids, conceptId);
    refresh();
    return { updated };
  });
}

export async function changeFlow(tab: string, txId: string, flow: Flow) {
  return run(async () => {
    if (!isId(txId) || !isFlow(flow)) throw new Error("Datos no válidos.");
    const ctx = await ctxFor(tab);
    await setTransactionFlow(ctx, txId, flow);
    refresh();
    return {};
  });
}

export async function newConcept(tab: string, name: string, section: ConceptSection) {
  return run(async () => {
    if (typeof name !== "string" || !SECTION_ORDER.includes(section)) throw new Error("Datos no válidos.");
    const ctx = await ctxFor(tab);
    const concept: ConceptOption = await createConcept(ctx, ctx.owner, name, section);
    return { concept };
  });
}

// --- Cuentas ----------------------------------------------------------------

/** Quita una cuenta sin movimientos (Casa o la persona). */
export async function removeAccount(accountId: string) {
  return run(async () => {
    if (!isId(accountId)) throw new Error("Cuenta no válida.");
    const ctx = await getDataContext();
    await deleteAccount(ctx, accountId);
    refresh();
    return {};
  });
}

// --- Cargar extracto --------------------------------------------------------

export async function loadTemplate(tab: string, accountId: string) {
  return run(async () => {
    if (!isId(accountId)) throw new Error("Cuenta no válida.");
    const ctx = await ctxFor(tab);
    const template = await getTemplate(ctx, accountId);
    return { template };
  });
}

export async function addAccount(tab: string, input: { name: string; bank: string; accountType: AccountType }) {
  return run(async () => {
    if (!input || typeof input.name !== "string" || typeof input.bank !== "string" || !(input.accountType in ACCOUNT_TYPES)) {
      throw new Error("Datos no válidos.");
    }
    const ctx = await ctxFor(tab);
    const account: Account = await createAccount(ctx, ctx.owner, input);
    refresh();
    return { account };
  });
}

const MAX_ROWS = 3000;

function validRows(rows: unknown): ParsedRow[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("El archivo no tiene movimientos.");
  if (rows.length > MAX_ROWS) throw new Error(`Máximo ${MAX_ROWS} movimientos por archivo.`);
  return rows.map((r) => {
    const row = r as ParsedRow;
    if (
      !row ||
      typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      typeof row.description !== "string" ||
      !row.description.trim() ||
      row.description.length > 500 ||
      typeof row.amount !== "number" ||
      !Number.isFinite(row.amount) ||
      Math.abs(row.amount) >= 1e9 ||
      (row.balance !== null && (typeof row.balance !== "number" || !Number.isFinite(row.balance))) ||
      (row.legacyDescription !== undefined &&
        (typeof row.legacyDescription !== "string" || row.legacyDescription.length > 500))
    ) {
      throw new Error("Hay filas con datos no válidos.");
    }
    return {
      line: Number(row.line) || 0,
      date: row.date,
      description: row.description.trim(),
      amount: row.amount,
      balance: row.balance,
      ...(row.legacyDescription?.trim() ? { legacyDescription: row.legacyDescription.trim() } : {}),
    };
  });
}

/**
 * Duplicados. Las filas idénticas (fecha|importe|descripción normalizada) de un
 * mismo archivo son movimientos distintos (p. ej. dos transferencias iguales el
 * mismo día) y se numeran por orden de aparición. La aparición n.º k es
 * duplicada si su import_hash ya existe en la cuenta o si la cuenta ya tiene al
 * menos k movimientos con esa clave (también con la descripción tal como la
 * leía la app anterior). Así, volver a cargar el mismo archivo no duplica nada
 * y, si solo faltaba una de dos filas iguales, se importa solo esa.
 */
function classify(accountId: string, rows: ParsedRow[], existing: { hashes: Set<string>; keys: Map<string, number> }) {
  const occurrences = new Map<string, number>();
  return rows.map((r) => {
    const key = duplicateKey(r.date, r.amount, r.description);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    const hash = importHash(accountId, r, occurrence);
    const legacyKey = r.legacyDescription ? duplicateKey(r.date, r.amount, r.legacyDescription) : null;
    const saved = Math.max(existing.keys.get(key) ?? 0, legacyKey ? (existing.keys.get(legacyKey) ?? 0) : 0);
    const duplicate: "db" | null = existing.hashes.has(hash) || occurrence <= saved ? "db" : null;
    return { hash, duplicate };
  });
}

export type PreviewRow = ParsedRow & {
  duplicate: "db" | null;
  suggestion: { conceptId: string; source: "exact" | "similar" } | null;
};

/** Paso 2: duplicados por import_hash y concepto sugerido por historial. */
export async function previewImport(tab: string, accountId: string, rows: ParsedRow[]) {
  return run(async () => {
    if (!isId(accountId)) throw new Error("Cuenta no válida.");
    const ctx = await ctxFor(tab);
    const parsed = validRows(rows);
    const [existing, history] = await Promise.all([existingImportKeys(ctx, accountId), conceptHistory(ctx)]);
    const suggest = buildSuggester(history);
    const status = classify(accountId, parsed, existing);

    const preview: PreviewRow[] = parsed.map((r, i) => {
      const duplicate = status[i].duplicate;
      const s = duplicate ? null : suggest(r.description);
      return { ...r, duplicate, suggestion: s ? { conceptId: s.conceptId, source: s.source } : null };
    });
    return { rows: preview };
  });
}

/** Días hacia atrás la primera vez que se trae una cuenta del banco (PSD2 suele dar 90). */
const FIRST_SYNC_DAYS = 89;

/** IP y navegador del usuario: el banco los pide cuando la consulta la hace alguien presente. */
async function psuHeaders() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null, userAgent: h.get("user-agent") };
}

/**
 * Paso 2 desde el banco: trae los movimientos contabilizados desde el último
 * día que ya tiene la cuenta (incluido) y los pasa por la misma comprobación
 * que un extracto. Ese primer día, un movimiento con el mismo importe que uno
 * ya guardado se da por duplicado (el banco y el extracto describen distinto).
 */
export async function previewFromBank(tab: string, accountId: string) {
  return run(async () => {
    if (!isId(accountId)) throw new Error("Cuenta no válida.");
    const ctx = await ctxFor(tab);
    const link = await bankLinkFor(ctx, accountId);
    if (!link) throw new Error("Esta cuenta no está conectada con el banco.");
    if (!link.active) throw new Error("El permiso del banco ha caducado. Vuelve a conectarlo en «Bancos».");

    const last = await lastTransactionDay(ctx, accountId);
    const from = last?.date ?? new Date(Date.now() - FIRST_SYNC_DAYS * 86400_000).toISOString().slice(0, 10);
    let rows: ParsedRow[];
    try {
      rows = toParsedRows(await fetchTransactions(link.ebAccountUid, from, await psuHeaders()));
    } catch (e) {
      if (e instanceof BankError) throw new Error(e.message);
      throw e;
    }
    if (rows.length > MAX_ROWS) rows = rows.slice(-MAX_ROWS);

    const [existing, history] = await Promise.all([existingImportKeys(ctx, accountId), conceptHistory(ctx)]);
    const suggest = buildSuggester(history);
    const status = classify(accountId, rows, existing);
    // Mismo día que el último guardado: cada importe ya guardado «gasta» un movimiento del banco.
    const sameDay = new Map<number, number>();
    for (const a of last?.amounts ?? []) sameDay.set(a, (sameDay.get(a) ?? 0) + 1);

    const preview: PreviewRow[] = rows.map((r, i) => {
      let duplicate = status[i].duplicate;
      if (!duplicate && last && r.date === last.date) {
        const left = sameDay.get(r.amount) ?? 0;
        if (left > 0) {
          sameDay.set(r.amount, left - 1);
          duplicate = "db";
        }
      }
      const s = duplicate ? null : suggest(r.description);
      return { ...r, duplicate, suggestion: s ? { conceptId: s.conceptId, source: s.source } : null };
    });
    return { rows: preview, from, aspsp: link.aspsp };
  });
}

/** Paso 3: guarda los nuevos (vuelve a comprobar duplicados) y la plantilla. */
/** Mes (año, mes) de una fecha «aaaa-mm-dd». */
const cellOf = (conceptId: string, date: string) => ({ conceptId, year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) });

/**
 * Antes de importar: conceptos y meses con importe escrito a mano en los que
 * caerían movimientos del extracto (lo escrito manda y el extracto no se vería).
 */
export async function checkImportConflicts(tab: string, rows: { date: string; conceptId: string | null }[]) {
  return run(async () => {
    if (!Array.isArray(rows) || rows.length > 5000) throw new Error("Datos no válidos.");
    const ctx = await ctxFor(tab);
    const cells = rows
      .filter((r) => typeof r.conceptId === "string" && isId(r.conceptId) && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
      .map((r) => cellOf(r.conceptId as string, r.date));
    return { conflicts: await manualConflicts(ctx, cells) };
  });
}

export async function commitImport(
  tab: string,
  accountId: string,
  template: ImportTemplate | null,
  rows: (ParsedRow & { conceptId: string | null })[],
  /** Celdas en las que se usa el extracto: se quita lo escrito a mano. */
  replaceManual: { conceptId: string; year: number; month: number }[] = [],
  /** «bank»: los movimientos vienen del banco (se apunta la fecha de la sincronización). */
  source: "file" | "bank" = "file",
) {
  return run(async () => {
    if (!isId(accountId)) throw new Error("Cuenta no válida.");
    const ctx = await ctxFor(tab);
    const parsed = validRows(rows);

    const allowed = new Set((await listConcepts(ctx, ctx.owner)).map((c) => c.id));
    const conceptIds = rows.map((r) => (r.conceptId && allowed.has(r.conceptId) ? r.conceptId : null));

    // Se vuelve a comprobar: puede haber entrado otra importación entre medias.
    const status = classify(accountId, parsed, await existingImportKeys(ctx, accountId));
    const fresh = parsed
      .map((r, i) => ({ ...r, importHash: status[i].hash, conceptId: conceptIds[i], duplicate: status[i].duplicate }))
      // Del banco ya se descartaron en la vista previa los del día de corte; aquí, solo los exactos.
      .filter((r) => !r.duplicate);

    if (
      !Array.isArray(replaceManual) ||
      replaceManual.length > 500 ||
      !replaceManual.every((c) => isId(c?.conceptId) && Number.isInteger(c.year) && Number.isInteger(c.month) && c.month >= 1 && c.month <= 12)
    ) {
      throw new Error("Datos no válidos.");
    }
    const inserted = await insertTransactions(ctx, accountId, fresh);
    // «Usar el extracto»: fuera lo escrito a mano en esas celdas (vuelve el automático).
    for (const c of replaceManual) await setManualAmount(ctx, c.conceptId, c.year, c.month, null);
    // Plantilla en letras de columna (formato que entiende también la app en producción).
    const letter = (v: unknown) => (typeof v === "string" && /^[A-Z]{1,3}$/.test(v) ? v : null);
    const m = template?.mapping;
    if (m && letter(m.date) && letter(m.description) && letter(m.amount)) {
      await saveTemplate(ctx, accountId, {
        headerRow: Math.max(1, Math.floor(Number(template.headerRow)) || 1),
        dataStartRow: Math.max(1, Math.floor(Number(template.dataStartRow)) || 2),
        startColumn: letter(template.startColumn) ?? "A",
        mapping: { date: letter(m.date), description: letter(m.description), amount: letter(m.amount), balance: letter(m.balance) },
      });
    }
    if (source === "bank") await markSynced(accountId);
    refresh();
    return {
      inserted,
      duplicates: parsed.length - fresh.length,
      withoutConcept: fresh.filter((r) => !r.conceptId).length,
    };
  });
}
