import "server-only";
import { createClient } from "@/lib/supabase/server";
import { duplicateKey, type ImportTemplate } from "@/lib/import/normalize";
import { assertOwner, type DataContext } from "./session";
import { accountBelongsTo } from "./accounts";
import { fetchAll, num } from "./query";

/**
 * Plantilla de columnas de una cuenta (import_templates, única por
 * user_id + account_id). Se prefiere la del usuario; si no tiene, la más
 * reciente de otro usuario para esa cuenta.
 */
export async function getTemplate(ctx: DataContext, accountId: string): Promise<ImportTemplate | null> {
  if (!(await accountBelongsTo(ctx, accountId, ctx.owner))) throw new Error("Cuenta no válida para este Balance.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_templates")
    .select("user_id, header_row, data_start_row, start_column, date_column, description_column, amount_column, balance_column, updated_at")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`Error de base de datos: ${error.message}`);
  const row = data?.find((r) => r.user_id === ctx.userId) ?? data?.[0];
  if (!row) return null;
  return {
    headerRow: Number(row.header_row) || 1,
    dataStartRow: Number(row.data_start_row) || 2,
    startColumn: String(row.start_column || "A"),
    mapping: {
      date: row.date_column ?? null,
      description: row.description_column ?? null,
      amount: row.amount_column ?? null,
      balance: row.balance_column ?? null,
    },
  };
}

export async function saveTemplate(ctx: DataContext, accountId: string, t: ImportTemplate) {
  if (!(await accountBelongsTo(ctx, accountId, ctx.owner))) throw new Error("Cuenta no válida para este Balance.");
  const supabase = await createClient();
  const { error } = await supabase.from("import_templates").upsert(
    {
      user_id: ctx.userId,
      account_id: accountId,
      header_row: t.headerRow,
      data_start_row: t.dataStartRow,
      start_column: t.startColumn,
      date_column: t.mapping.date,
      description_column: t.mapping.description,
      amount_column: t.mapping.amount,
      balance_column: t.mapping.balance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,account_id" },
  );
  if (error) throw new Error(`No se pudo guardar la plantilla: ${error.message}`);
}

/**
 * Lo ya guardado en la cuenta para detectar duplicados: sus import_hash (de
 * cualquier formato) y la clave fecha|importe|descripción normalizada.
 */
export async function existingImportKeys(ctx: DataContext, accountId: string) {
  if (!(await accountBelongsTo(ctx, accountId, ctx.owner))) throw new Error("Cuenta no válida para este Balance.");
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    supabase
      .from("transactions")
      .select("id, transaction_date, amount, description, import_hash")
      .eq("account_id", accountId)
      .order("id")
      .range(a, b),
  );
  const hashes = new Set<string>();
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.import_hash) hashes.add(String(r.import_hash));
    keys.add(duplicateKey(String(r.transaction_date), num(r.amount), String(r.description ?? "")));
  }
  return { hashes, keys };
}

export type NewTransaction = {
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  importHash: string;
  conceptId: string | null;
};

/** Inserta movimientos nuevos en el Balance activo (flow normal). */
export async function insertTransactions(ctx: DataContext, accountId: string, rows: NewTransaction[]) {
  assertOwner(ctx, ctx.owner);
  if (rows.length === 0) return 0;
  const supabase = await createClient();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase
      .from("transactions")
      .insert(
        rows.slice(i, i + 500).map((r) => ({
          user_id: ctx.userId,
          account_id: accountId,
          owner: ctx.owner,
          transaction_date: r.date,
          description: r.description,
          amount: r.amount,
          balance: r.balance,
          movement_type: r.amount >= 0 ? "income" : "expense",
          import_hash: r.importHash,
          concept_id: r.conceptId,
          flow: "normal",
          // category_* son las categorías antiguas (solo lectura): no se tocan.
        })),
      )
      .select("id");
    if (error) {
      if (error.code === "23505") {
        throw new Error(
          `Algunos movimientos ya existían (importación simultánea). Se han guardado ${inserted}; vuelve a cargar el archivo para ver el resto.`,
        );
      }
      throw new Error(`Error guardando movimientos: ${error.message}`);
    }
    inserted += data?.length ?? 0;
  }
  return inserted;
}
