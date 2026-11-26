import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ownershipScopeFromOwner, type Owner } from "@/lib/balance";
import type { BankAccount } from "@/lib/banking/enable-banking";
import { assertOwner, type DataContext } from "./session";
import { accountBelongsTo } from "./accounts";

/**
 * Bancos conectados (script 17). Cada persona solo ve sus conexiones (RLS
 * user_id = auth.uid()); aquí además se comprueba que la cuenta de la app
 * pertenece a un Balance que la sesión puede ver.
 */

export type BankSession = {
  id: string;
  aspsp: string;
  status: "pending" | "active" | "closed";
  validUntil: string | null;
  expired: boolean;
  accounts: BankAccount[];
  createdAt: string;
};

export type BankLink = {
  accountId: string;
  sessionId: string;
  ebAccountUid: string;
  lastSyncedAt: string | null;
};

const dbError = (e: { message: string }) => new Error(`Error de base de datos: ${e.message}`);

function mapSession(r: Record<string, unknown>): BankSession {
  const validUntil = r.valid_until ? String(r.valid_until) : null;
  return {
    id: String(r.id),
    aspsp: String(r.aspsp_name),
    status: r.status as BankSession["status"],
    validUntil,
    expired: validUntil !== null && new Date(validUntil).getTime() < Date.now(),
    accounts: Array.isArray(r.accounts) ? (r.accounts as BankAccount[]) : [],
    createdAt: String(r.created_at),
  };
}

/** Conexiones del usuario (sin las idas al banco que no volvieron) y sus enlaces. */
export async function listBankConnections(ctx: DataContext) {
  void ctx;
  const supabase = await createClient();
  const [s, l] = await Promise.all([
    supabase.from("bank_sessions").select("*").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("bank_links").select("account_id, bank_session_id, eb_account_uid, last_synced_at"),
  ]);
  if (s.error) throw dbError(s.error);
  if (l.error) throw dbError(l.error);
  return {
    sessions: (s.data ?? []).map(mapSession),
    links: (l.data ?? []).map(
      (r): BankLink => ({
        accountId: String(r.account_id),
        sessionId: String(r.bank_session_id),
        ebAccountUid: String(r.eb_account_uid),
        lastSyncedAt: r.last_synced_at ? String(r.last_synced_at) : null,
      }),
    ),
  };
}

/** Ida al banco: guarda el `state` (atado al usuario) antes de redirigir. */
export async function createPendingBankSession(ctx: DataContext, aspsp: string, country: string, state: string) {
  const supabase = await createClient();
  // Limpieza: idas al banco sin vuelta de hace más de un día.
  await supabase
    .from("bank_sessions")
    .delete()
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 86400_000).toISOString());
  const { error } = await supabase
    .from("bank_sessions")
    .insert({ user_id: ctx.userId, aspsp_name: aspsp, aspsp_country: country, state, status: "pending" });
  if (error) throw dbError(error);
}

/** Vuelta del banco: la ida pendiente de este usuario con ese `state`. */
export async function findPendingBankSession(state: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_sessions")
    .select("*")
    .eq("state", state)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw dbError(error);
  return data ? mapSession(data) : null;
}

export async function activateBankSession(
  id: string,
  input: { sessionId: string; validUntil: string | null; accounts: BankAccount[] },
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_sessions")
    .update({ session_id: input.sessionId, valid_until: input.validUntil, accounts: input.accounts, status: "active" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw dbError(error);
}

export async function dropBankSession(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_sessions").delete().eq("id", id);
  if (error) throw dbError(error);
}

/** Sesión de Enable Banking (id externo) de una conexión del usuario. */
export async function bankSessionExternalId(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bank_sessions").select("session_id").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  return data?.session_id ? String(data.session_id) : null;
}

/** Cuenta de la app de un Balance visible para la sesión (casa o la persona). */
async function ownerOfAccount(ctx: DataContext, accountId: string): Promise<Owner | null> {
  for (const owner of ctx.allowedOwners) {
    if (await accountBelongsTo(ctx, accountId, owner)) return owner;
  }
  return null;
}

/**
 * Enlaza (o desenlaza, con `accountId` null) una cuenta del banco con una
 * cuenta de la app. Una cuenta de la app solo puede tener un enlace.
 */
export async function setBankLink(ctx: DataContext, bankSessionId: string, ebAccountUid: string, accountId: string | null) {
  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("bank_sessions")
    .select("*")
    .eq("id", bankSessionId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!session) throw new Error("Conexión no encontrada.");
  if (!mapSession(session).accounts.some((a) => a.uid === ebAccountUid)) throw new Error("Cuenta del banco no válida.");

  // Quita el enlace anterior de esa cuenta del banco.
  const del = await supabase.from("bank_links").delete().eq("bank_session_id", bankSessionId).eq("eb_account_uid", ebAccountUid);
  if (del.error) throw dbError(del.error);
  if (!accountId) return;

  if (!(await ownerOfAccount(ctx, accountId))) throw new Error("Cuenta no válida.");
  const { error: e2 } = await supabase.from("bank_links").upsert(
    { account_id: accountId, bank_session_id: bankSessionId, eb_account_uid: ebAccountUid, user_id: ctx.userId, last_synced_at: null },
    { onConflict: "account_id" },
  );
  if (e2) {
    // La cuenta de la app ya la enlazó otra persona (su fila no se ve por RLS).
    if (e2.code === "42501" || e2.code === "23505") throw new Error("Esa cuenta ya está conectada por la otra persona.");
    throw dbError(e2);
  }
}

/** Enlace de una cuenta de la app, con su conexión (para traer movimientos). */
export async function bankLinkFor(ctx: DataContext, accountId: string) {
  assertOwner(ctx, ctx.owner);
  if (!(await accountBelongsTo(ctx, accountId, ctx.owner))) throw new Error("Cuenta no válida para este Balance.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_links")
    .select("eb_account_uid, last_synced_at, bank_sessions!inner(id, aspsp_name, session_id, valid_until, status)")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) return null;
  const s = (Array.isArray(data.bank_sessions) ? data.bank_sessions[0] : data.bank_sessions) as Record<string, unknown>;
  const validUntil = s.valid_until ? String(s.valid_until) : null;
  return {
    ebAccountUid: String(data.eb_account_uid),
    aspsp: String(s.aspsp_name),
    active: s.status === "active" && (validUntil === null || new Date(validUntil).getTime() > Date.now()),
    validUntil,
  };
}

export async function markSynced(accountId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_links").update({ last_synced_at: new Date().toISOString() }).eq("account_id", accountId);
  if (error) throw dbError(error);
}

/** Fecha del último movimiento guardado en la cuenta y los de ese día (fecha|importe). */
export async function lastTransactionDay(ctx: DataContext, accountId: string) {
  if (!(await accountBelongsTo(ctx, accountId, ctx.owner))) throw new Error("Cuenta no válida para este Balance.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("transaction_date")
    .eq("account_id", accountId)
    .order("transaction_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) return null;
  const date = String(data.transaction_date);
  const { data: same, error: e2 } = await supabase
    .from("transactions")
    .select("amount")
    .eq("account_id", accountId)
    .eq("transaction_date", date);
  if (e2) throw dbError(e2);
  return { date, amounts: (same ?? []).map((r) => Math.round(Number(r.amount) * 100) / 100) };
}

/** Cuentas de la app que la sesión puede enlazar (Casa y la persona), con su Balance. */
export async function linkableAccounts(ctx: DataContext) {
  const supabase = await createClient();
  const owners: Owner[] = ctx.allowedOwners.filter((o) => o === "casa" || o === ctx.person);
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, bank, ownership_scope")
    .in("ownership_scope", owners.map(ownershipScopeFromOwner))
    .order("name");
  if (error) throw dbError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    bank: r.bank ? String(r.bank) : null,
    owner: owners.find((o) => ownershipScopeFromOwner(o) === r.ownership_scope) ?? "casa",
  }));
}
