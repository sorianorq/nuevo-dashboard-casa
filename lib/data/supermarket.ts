import "server-only";
import { createClient } from "@/lib/supabase/server";
import { supermarketSummary, type SupermarketSummary } from "@/lib/calc/summary";
import {
  categoryBreakdown,
  purchasesOfMonth,
  storeBreakdown,
  type CategorySpend,
  type Purchase,
  type StoreSpend,
} from "@/lib/calc/supermarket";
import { addMonths, monthEnd, monthStart, type YearMonth } from "@/lib/months";
import { getSession } from "./session";
import { fetchAll, num } from "./query";

export type SupermarketData = {
  summary: SupermarketSummary;
  count: number;
  averageTicket: number | null;
  categories: CategorySpend[];
  stores: StoreSpend[];
  /** Compras del mes, de la más reciente a la más antigua. */
  purchases: Purchase[];
};

function toPurchase(r: Record<string, unknown>): Purchase {
  const items = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  return {
    id: String(r.id),
    date: String(r.purchase_date),
    store: typeof r.store_name === "string" ? r.store_name : null,
    payment: typeof r.payment_type === "string" ? r.payment_type : null,
    total: num(r.total),
    // Agrupar siempre por catId (los nombres de categoría cambiaron).
    lines: items.map((i) => ({ catId: String(i.catId ?? "otros"), amount: num(i.amount) })),
  };
}

/**
 * Supermercado del mes. Sección compartida (la ven todos los roles): exige
 * sesión, pero no se filtra por Balance. Tabla oficial: `supermarket_purchases`
 * (no `purchase_batches` / `purchase_items`).
 */
export async function getSupermarket(ym: YearMonth, today: string): Promise<SupermarketData> {
  await getSession();
  const supabase = await createClient();
  const from = monthStart(addMonths(ym, -12));
  const to = monthEnd(ym);

  const [rows, first] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("supermarket_purchases")
        .select("id, purchase_date, store_name, payment_type, total, items")
        .gte("purchase_date", from)
        .lte("purchase_date", to)
        .order("id")
        .range(a, b),
    ),
    supabase
      .from("supermarket_purchases")
      .select("purchase_date")
      .order("purchase_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (first.error) throw new Error(`Error de base de datos: ${first.error.message}`);
  const firstDate = first.data ? String(first.data.purchase_date) : null;

  const purchases = rows.map(toPurchase);
  const summary = supermarketSummary(
    purchases.map((p) => ({ purchase_date: p.date, total: p.total })),
    ym,
    today,
    firstDate,
  );
  const month = purchasesOfMonth(purchases, ym, today).sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );

  return {
    summary,
    count: month.length,
    averageTicket: month.length ? Math.round((summary.spent / month.length) * 100) / 100 : null,
    categories: categoryBreakdown(purchases, ym, today, firstDate),
    stores: storeBreakdown(month),
    purchases: month,
  };
}
