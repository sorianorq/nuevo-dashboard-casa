import "server-only";
import { createSign, randomBytes } from "node:crypto";
import type { ParsedRow } from "@/lib/import/normalize";

/**
 * Cliente mínimo de la API de Enable Banking (PSD2, solo lectura de cuentas).
 * Autenticación: JWT RS256 firmado con la clave privada de la aplicación
 * (kid = Application ID), válido 1 hora.
 *
 * Variables de entorno (solo en el servidor):
 *   ENABLE_BANKING_APP_ID       Application ID del Control Panel.
 *   ENABLE_BANKING_PRIVATE_KEY  Contenido del .pem (se admiten saltos «\n»).
 */

const API = "https://api.enablebanking.com";

export class BankError extends Error {
  /** El permiso del banco ha caducado o se ha retirado: hay que volver a conectar. */
  readonly expired: boolean;
  constructor(message: string, expired = false) {
    super(message);
    this.expired = expired;
  }
}

export function bankConfigured() {
  return Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

function token() {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const key = process.env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !key) throw new BankError("La conexión con bancos no está configurada todavía.");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const body = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${b64url(sig)}`;
}

/** Cabeceras del usuario presente (IP y navegador): evitan el límite de 4 consultas al día. */
export type PsuHeaders = { ip?: string | null; userAgent?: string | null };

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, psu?: PsuHeaders): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token()}`, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (psu?.ip) headers["Psu-Ip-Address"] = psu.ip;
  if (psu?.userAgent) headers["Psu-User-Agent"] = psu.userAgent.slice(0, 500);
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (res.ok) return (await res.json()) as T;
  const text = await res.text().catch(() => "");
  let detail = "";
  try {
    const j = JSON.parse(text) as { message?: string; error?: string; detail?: unknown };
    detail = [j.error, j.message].filter(Boolean).join(": ");
  } catch {
    detail = text.slice(0, 200);
  }
  console.error(`Enable Banking ${method} ${path.split("?")[0]} → ${res.status} ${detail}`);
  const expired =
    /EXPIRED|CLOSED_SESSION|REVOKED|CONSENT|ACCESS_DENIED|NOT_AUTHORIZED/i.test(detail) ||
    (res.status === 401 && path.startsWith("/accounts") && !/jwt|token/i.test(detail));
  if (expired) throw new BankError("El permiso del banco ha caducado o se ha retirado. Vuelve a conectar el banco.", true);
  if (res.status === 429) throw new BankError("El banco limita las consultas: prueba más tarde.");
  throw new BankError(`El banco no ha respondido bien (${res.status}).`);
}

// --- Bancos -------------------------------------------------------------------

export type Aspsp = { name: string; country: string; maxDays: number | null; beta: boolean };

export async function listBanks(country = "ES"): Promise<Aspsp[]> {
  const res = await call<{ aspsps: { name: string; country: string; beta?: boolean; maximum_consent_validity?: number; psu_types?: string[] }[] }>(
    "GET",
    `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal&service=AIS`,
  );
  return res.aspsps
    .map((a) => ({
      name: a.name,
      country: a.country,
      beta: Boolean(a.beta),
      // maximum_consent_validity viene en segundos.
      maxDays: a.maximum_consent_validity ? Math.floor(a.maximum_consent_validity / 86400) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// --- Permiso (ida y vuelta al banco) --------------------------------------------

export function newState() {
  return randomBytes(24).toString("base64url");
}

/** Pide al banco el permiso de lectura; devuelve la URL a la que ir. */
export async function startAuth(input: { aspsp: string; country: string; state: string; redirectUrl: string; days: number }, psu?: PsuHeaders) {
  const validUntil = new Date(Date.now() + input.days * 86400_000).toISOString();
  const res = await call<{ url: string }>(
    "POST",
    "/auth",
    {
      access: { valid_until: validUntil },
      aspsp: { name: input.aspsp, country: input.country },
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: "personal",
      language: "es",
    },
    psu,
  );
  return res.url;
}

export type BankAccount = { uid: string; name: string; last4: string | null; currency: string | null };

/** Tras volver del banco: canjea el código por una sesión con sus cuentas. */
export async function createSession(code: string, psu?: PsuHeaders) {
  const res = await call<{
    session_id: string;
    access?: { valid_until?: string };
    accounts: { uid: string; name?: string; currency?: string; account_id?: { iban?: string; other?: { identification?: string } }; product?: string }[];
  }>("POST", "/sessions", { code }, psu);
  const accounts: BankAccount[] = res.accounts
    .filter((a) => a.uid)
    .map((a) => {
      const id = a.account_id?.iban ?? a.account_id?.other?.identification ?? "";
      return {
        uid: a.uid,
        name: (a.name || a.product || "Cuenta").trim(),
        last4: id ? id.replace(/\s/g, "").slice(-4) : null,
        currency: a.currency ?? null,
      };
    });
  return { sessionId: res.session_id, validUntil: res.access?.valid_until ?? null, accounts };
}

export async function closeSession(sessionId: string) {
  await call("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
}

// --- Movimientos ----------------------------------------------------------------

export type EbTransaction = {
  entry_reference?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator?: "CRDT" | "DBIT" | string | null;
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  bank_transaction_code?: { description?: string | null } | null;
  balance_after_transaction?: { amount: string; currency: string } | null;
  note?: string | null;
};

/** Movimientos contabilizados (BOOK) de una cuenta desde una fecha, con todas las páginas. */
export async function fetchTransactions(uid: string, dateFrom: string, psu?: PsuHeaders): Promise<EbTransaction[]> {
  const out: EbTransaction[] = [];
  let key: string | null = null;
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({ date_from: dateFrom, transaction_status: "BOOK" });
    if (key) qs.set("continuation_key", key);
    const res: { transactions?: EbTransaction[]; continuation_key?: string | null } = await call(
      "GET",
      `/accounts/${encodeURIComponent(uid)}/transactions?${qs}`,
      undefined,
      psu,
    );
    out.push(...(res.transactions ?? []));
    key = res.continuation_key ?? null;
    if (!key) break;
  }
  return out;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Movimiento del banco → fila como las de un extracto (fecha, descripción,
 * importe con signo y saldo si lo da). Descarta lo que no está contabilizado
 * o no es en euros.
 */
export function toParsedRows(txs: EbTransaction[]): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const t of txs) {
    if (t.status && t.status !== "BOOK") continue;
    if (t.transaction_amount?.currency && t.transaction_amount.currency !== "EUR") continue;
    const date = t.booking_date ?? t.value_date ?? t.transaction_date;
    const raw = Number(t.transaction_amount?.amount);
    if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date) || !Number.isFinite(raw)) continue;
    const amount = Math.round((t.credit_debit_indicator === "DBIT" ? -Math.abs(raw) : t.credit_debit_indicator === "CRDT" ? Math.abs(raw) : raw) * 100) / 100;
    const counterpart = amount < 0 ? t.creditor?.name : t.debtor?.name;
    const description =
      clean((t.remittance_information ?? []).join(" ")) ||
      clean(counterpart) ||
      clean(t.bank_transaction_code?.description) ||
      clean(t.note) ||
      "Movimiento del banco";
    const bal = Number(t.balance_after_transaction?.amount);
    rows.push({
      line: rows.length + 1,
      date: date.slice(0, 10),
      description: description.slice(0, 500),
      amount,
      balance: t.balance_after_transaction && Number.isFinite(bal) ? bal : null,
    });
  }
  // Del más antiguo al más reciente, como un extracto ordenado.
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.line - b.line));
  return rows.map((r, i) => ({ ...r, line: i + 1 }));
}
