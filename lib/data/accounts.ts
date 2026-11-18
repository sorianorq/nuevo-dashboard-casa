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
