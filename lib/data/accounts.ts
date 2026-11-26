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

/** Cuenta por defecto a la que van los movimientos de una cuenta quitada (una por Balance). */
export const RAW_ACCOUNT_NAME = "Cuenta Raw";

async function ownerOf(ctx: DataContext, accountId: string): Promise<Owner | null> {
  for (const o of ctx.allowedOwners.filter((x) => x === "casa" || x === ctx.person)) {
    if (await accountBelongsTo(ctx, accountId, o)) return o;
  }
  return null;
}

/** La «Cuenta Raw» del Balance; se crea si no existe. */
async function rawAccount(ctx: DataContext, owner: Owner): Promise<Account> {
  const found = (await listAccounts(ctx, owner)).find((a) => a.name.trim().toLowerCase() === RAW_ACCOUNT_NAME.toLowerCase());
  return found ?? createAccount(ctx, owner, { name: RAW_ACCOUNT_NAME, bank: "", accountType: "personal" });
}

/**
 * Quita una cuenta. Sus movimientos NO se borran: pasan antes a `target`
 * (otra cuenta del mismo Balance) o, con "raw", a la «Cuenta Raw» del
 * Balance. Se quitan también su plantilla de columnas y su enlace con el
 * banco. Con el script 18, la base de datos impide borrar una cuenta que aún
 * tenga movimientos.
 */
export async function deleteAccount(ctx: DataContext, accountId: string, target: string | "raw" = "raw") {
  const owner = await ownerOf(ctx, accountId);
  if (!owner) throw new Error("Cuenta no válida.");
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);
  if (error) throw new Error(`Error de base de datos: ${error.message}`);
  const movements = count ?? 0;

  let movedTo: Account | null = null;
  if (movements > 0) {
    if (target === "raw") {
      movedTo = await rawAccount(ctx, owner);
    } else {
      if (!(await accountBelongsTo(ctx, target, owner))) throw new Error("La cuenta de destino tiene que ser del mismo Balance.");
      movedTo = (await listAccounts(ctx, owner)).find((a) => a.id === target) ?? null;
    }
    if (!movedTo) throw new Error("Cuenta de destino no válida.");
    if (movedTo.id === accountId) throw new Error("Elige otra cuenta para sus movimientos.");

    const { data: moved, error: e1 } = await supabase
      .from("transactions")
      .update({ account_id: movedTo.id })
      .eq("account_id", accountId)
      .select("id");
    if (e1) {
      if (e1.code === "23505") throw new Error("Algunos movimientos ya existen en la cuenta de destino. Elige otra cuenta.");
      throw new Error(`No se pudieron pasar los movimientos: ${e1.message}`);
    }
    if ((moved?.length ?? 0) !== movements) {
      throw new Error(`Solo se han podido pasar ${moved?.length ?? 0} de ${movements} movimientos a «${movedTo.name}». La cuenta no se ha quitado.`);
    }
  }

  const t = await supabase.from("import_templates").delete().eq("account_id", accountId);
  if (t.error) throw new Error(`No se pudo quitar la plantilla: ${t.error.message}`);
  const { data, error: e2 } = await supabase.from("accounts").delete().eq("id", accountId).select("id");
  if (e2) {
    if (e2.code === "23503") throw new Error("La cuenta se usa en otra parte de la app y no se puede quitar (sus movimientos ya se han pasado).");
    throw new Error(`No se pudo quitar la cuenta: ${e2.message}`);
  }
  // Si la base de datos no deja borrarla, Supabase no borra nada y no da error.
  if (!data?.length) throw new Error("La base de datos no ha dejado quitar esta cuenta.");
  return { moved: movements, movedTo: movedTo?.name ?? null };
}
