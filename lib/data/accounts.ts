import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ownershipScopeFromOwner, type Owner } from "@/lib/balance";
import { assertOwner, type DataContext } from "./session";
import { fetchAll } from "./query";

import { ACCOUNT_TYPES, type Account, type AccountType } from "@/lib/labels";

export type { Account, AccountType };

/** Cuentas de un Balance (accounts.ownership_scope: common → casa). */
export async function listAccounts(ctx: DataContext, owner: Owner): Promise<Account[]> {
  assertOwner(ctx, owner);
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase
      .from("accounts")
      .select("id, name, bank")
      .eq("ownership_scope", ownershipScopeFromOwner(owner))
      .order("name")
      .order("id")
      .range(a, b),
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), bank: r.bank ? String(r.bank) : null }));
}

/** La cuenta existe y pertenece al Balance. */
export async function accountBelongsTo(ctx: DataContext, accountId: string, owner: Owner) {
  assertOwner(ctx, owner);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("ownership_scope", ownershipScopeFromOwner(owner))
    .maybeSingle();
  if (error) throw new Error(`Error de base de datos: ${error.message}`);
  return Boolean(data);
}

/** Crea una cuenta en el Balance (mismos valores que la app anterior). */
export async function createAccount(
  ctx: DataContext,
  owner: Owner,
  input: { name: string; bank: string; accountType: AccountType },
): Promise<Account> {
  assertOwner(ctx, owner);
  const name = input.name.trim();
  if (!name) throw new Error("Escribe un nombre para la cuenta.");
  if (!(input.accountType in ACCOUNT_TYPES)) throw new Error("Tipo de cuenta no válido.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: ctx.userId,
      name,
      bank: input.bank.trim() || null,
      account_type: input.accountType,
      currency: "EUR",
      ownership_scope: ownershipScopeFromOwner(owner),
    })
    .select("id, name, bank")
    .single();
  if (error) throw new Error(`No se pudo crear la cuenta: ${error.message}`);
  return { id: String(data.id), name: String(data.name), bank: data.bank ? String(data.bank) : null };
}

export type AccountRow = Account & { owner: Owner; movements: number };

/** Cuentas de Casa y de la persona, con cuántos movimientos tiene cada una. */
export async function listAccountsWithCounts(ctx: DataContext): Promise<AccountRow[]> {
  const owners = ctx.allowedOwners.filter((o) => o === "casa" || o === ctx.person);
  const supabase = await createClient();
  const out: AccountRow[] = [];
  for (const owner of owners) {
    for (const a of await listAccounts(ctx, owner)) {
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("account_id", a.id);
      if (error) throw new Error(`Error de base de datos: ${error.message}`);
      out.push({ ...a, owner, movements: count ?? 0 });
    }
  }
  return out;
}

/**
 * Quita una cuenta SIN movimientos (también su plantilla de columnas y su
 * enlace con el banco). Con el script 18, la base de datos también lo impide.
 */
export async function deleteAccount(ctx: DataContext, accountId: string) {
  const owners = ctx.allowedOwners.filter((o) => o === "casa" || o === ctx.person);
  let ok = false;
  for (const o of owners) if (await accountBelongsTo(ctx, accountId, o)) ok = true;
  if (!ok) throw new Error("Cuenta no válida.");

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);
  if (error) throw new Error(`Error de base de datos: ${error.message}`);
  if ((count ?? 0) > 0) throw new Error(`Esta cuenta tiene ${count} movimientos: no se puede quitar.`);

  const t = await supabase.from("import_templates").delete().eq("account_id", accountId);
  if (t.error) throw new Error(`No se pudo quitar la plantilla: ${t.error.message}`);
  const { data, error: e2 } = await supabase.from("accounts").delete().eq("id", accountId).select("id");
  if (e2) {
    if (e2.code === "23503") throw new Error("La cuenta se usa en otra parte de la app y no se puede quitar.");
    throw new Error(`No se pudo quitar la cuenta: ${e2.message}`);
  }
  // Si la base de datos no deja borrarla, Supabase no borra nada y no da error.
  if (!data?.length) throw new Error("La base de datos no ha dejado quitar esta cuenta.");
}
