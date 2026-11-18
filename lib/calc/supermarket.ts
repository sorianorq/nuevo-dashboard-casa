/**
 * Supermercado (fase 3): reglas puras sobre las compras.
 * Los datos clave del mes (gasto, % vs mes anterior, desvío vs media) salen de
 * `supermarketSummary` (lib/calc/summary.ts), la misma regla que el Resumen.
 */
import { SUPER_CATEGORY_NAME } from "@/lib/labels";
import { addMonths, compareYm, daysInMonth, monthEnd, monthsEndingAt, ymKey, ymOf, type YearMonth } from "@/lib/months";
import { round2 } from "./summary";

export type PurchaseLine = { catId: string; amount: number };

export type Purchase = {
  id: string;
  date: string;
  store: string | null;
  payment: string | null;
  total: number;
  lines: PurchaseLine[];
};

export type CategorySpend = {
  catId: string;
  name: string;
  amount: number;
  /** Media de los 12 meses cerrados anteriores (proporcional en mes en curso). */
  reference: number | null;
  deviation: number | null;
};

export type StoreSpend = { store: string; count: number; amount: number };

/** Compras del mes (en el mes en curso, solo hasta hoy, como el gasto del mes). */
export function purchasesOfMonth(purchases: Purchase[], ym: YearMonth, today: string): Purchase[] {
  const key = ymKey(ym);
  const isCurrent = compareYm(ym, ymOf(today)) === 0;
  return purchases.filter((p) => p.date.startsWith(key) && (!isCurrent || p.date <= today));
}

/**
 * Gasto por categoría (`catId`) en el mes frente a la media de los 12 meses
 * cerrados anteriores desde la primera compra; en el mes en curso, la media
 * se prorratea por los días transcurridos (misma regla que el total).
 */
export function categoryBreakdown(
  purchases: Purchase[],
  ym: YearMonth,
  today: string,
  firstPurchaseDate: string | null,
): CategorySpend[] {
  const isCurrent = compareYm(ym, ymOf(today)) === 0;
  const month = new Map<string, number>();
  for (const p of purchasesOfMonth(purchases, ym, today)) {
    for (const l of p.lines) month.set(l.catId, (month.get(l.catId) ?? 0) + l.amount);
  }

  const closed = monthsEndingAt(addMonths(ym, -1), 12).filter(
    (m) => firstPurchaseDate !== null && monthEnd(m) >= firstPurchaseDate,
  );
  const closedKeys = new Set(closed.map(ymKey));
  const history = new Map<string, number>();
  for (const p of purchases) {
    if (!closedKeys.has(p.date.slice(0, 7))) continue;
    for (const l of p.lines) history.set(l.catId, (history.get(l.catId) ?? 0) + l.amount);
  }
  const factor = isCurrent ? Number(today.slice(8, 10)) / daysInMonth(ym) : 1;

  const ids = new Set([...month.keys(), ...history.keys()]);
  return [...ids]
    .map((catId) => {
      const amount = round2(month.get(catId) ?? 0);
      const reference = closed.length ? round2(((history.get(catId) ?? 0) / closed.length) * factor) : null;
      return {
        catId,
        name: SUPER_CATEGORY_NAME[catId] ?? catId,
        amount,
        reference,
        deviation: reference === null ? null : round2(amount - reference),
      };
    })
    .filter((c) => c.amount > 0 || (c.reference ?? 0) > 0)
    .sort((a, b) => b.amount - a.amount || (b.reference ?? 0) - (a.reference ?? 0));
}

/** Gasto por tienda en el mes. */
export function storeBreakdown(monthPurchases: Purchase[]): StoreSpend[] {
  const map = new Map<string, StoreSpend>();
  for (const p of monthPurchases) {
    const store = p.store?.trim() || "Sin tienda";
    const s = map.get(store) ?? { store, count: 0, amount: 0 };
    s.count += 1;
    s.amount = round2(s.amount + p.total);
    map.set(store, s);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** ¿El total de la compra no cuadra con la suma de sus líneas? */
export function linesMismatch(p: Purchase): number | null {
  const sum = round2(p.lines.reduce((s, l) => s + l.amount, 0));
  return Math.abs(sum - p.total) > 0.005 ? round2(p.total - sum) : null;
}
