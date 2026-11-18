"use server";

import { refresh } from "next/cache";
import {
  applyConceptToMany,
  conceptHistory,
  createAccount,
  createConcept,
  existingImportKeys,
  findSimilar,
  getDataContext,
  getTemplate,
  insertTransactions,
  listConcepts,
  saveTemplate,
  setTransactionConcept,
  setTransactionFlow,
} from "@/lib/data";
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
 * Duplicados: una fila lo es si su import_hash ya existe en la cuenta, si
 * coincide fecha|importe|descripción normalizada con un movimiento guardado
 * (también con la descripción tal como la leía la app anterior), o si se
 * repite dentro del propio archivo.
 */
function classify(accountId: string, rows: ParsedRow[], existing: { hashes: Set<string>; keys: Set<string> }) {
  const seen = new Set<string>();
  return rows.map((r) => {
    const hash = importHash(accountId, r);
    const key = duplicateKey(r.date, r.amount, r.description);
    const legacyKey = r.legacyDescription ? duplicateKey(r.date, r.amount, r.legacyDescription) : null;
    const inDb = existing.hashes.has(hash) || existing.keys.has(key) || (legacyKey !== null && existing.keys.has(legacyKey));
    const duplicate: "db" | "file" | null = inDb ? "db" : seen.has(hash) ? "file" : null;
    seen.add(hash);
    return { hash, duplicate };
  });
}

export type PreviewRow = ParsedRow & {
  duplicate: "db" | "file" | null;
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

/** Paso 3: guarda los nuevos (vuelve a comprobar duplicados) y la plantilla. */
export async function commitImport(
  tab: string,
  accountId: string,
  template: ImportTemplate,
  rows: (ParsedRow & { conceptId: string | null })[],
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
      .filter((r) => !r.duplicate);

    const inserted = await insertTransactions(ctx, accountId, fresh);
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
    refresh();
    return {
      inserted,
      duplicates: parsed.length - fresh.length,
      withoutConcept: fresh.filter((r) => !r.conceptId).length,
    };
  });
}
