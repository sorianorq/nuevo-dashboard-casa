import type { BalanceRow } from "@/lib/calc/balance";
import type { ConceptSection } from "@/lib/labels";

export type BalanceView = "real" | "presupuesto" | "desvio";

export const VIEW_LABEL: Record<BalanceView, string> = {
  real: "Real",
  presupuesto: "Presupuesto",
  desvio: "Desvío",
};

export function parseView(value: unknown): BalanceView {
  return value === "presupuesto" || value === "desvio" ? value : "real";
}

/** Valores de una fila o total según la vista. */
export function valuesFor(
  item: { real: (number | null)[]; budget: (number | null)[]; deviation: (number | null)[] },
  view: BalanceView,
) {
  return view === "real" ? item.real : view === "presupuesto" ? item.budget : item.deviation;
}

/**
 * ¿El desvío es favorable? En Ingresos y Ahorro, más es mejor; en Gastos,
 * menos. En el resultado, más es mejor. El signo acompaña siempre al color.
 */
export function deviationTone(value: number, section: ConceptSection | "resultado"): "positive" | "warning" | null {
  if (Math.abs(value) < 0.005) return null;
  const good = section === "gastos" ? value < 0 : value > 0;
  return good ? "positive" : "warning";
}

/** Enlace a los movimientos de una celda (solo conceptos con origen en movimientos). */
export function cellHref(
  row: Pick<BalanceRow, "id" | "kind" | "linkSource" | "manualOverride">,
  year: number,
  monthIndex: number,
  monthsElapsed: number,
  personal: boolean,
): string | null {
  if (row.kind !== "linked" || row.linkSource !== "movimientos") return null;
  if (monthIndex >= monthsElapsed || row.manualOverride[monthIndex]) return null;
  const qs = new URLSearchParams({ mes: `${year}-${String(monthIndex + 1).padStart(2, "0")}`, concepto: row.id });
  if (personal) qs.set("balance", "personal");
  return `/contabilidad/movimientos?${qs}`;
}

/** Texto de ayuda de una celda (title). */
export function cellNote(row: Pick<BalanceRow, "kind" | "linkSource" | "manualOverride">, monthIndex: number): string {
  if (row.kind === "subtotal") return "Suma de sus conceptos";
  if (row.kind === "manual") return "Importe escrito a mano";
  if (row.manualOverride[monthIndex]) return "Escrito a mano: manda sobre el automático";
  if (row.linkSource === "supermercado") return "Desde Supermercado";
  if (row.linkSource === "pagos") return "Desde Pagos";
  return "Ver sus movimientos";
}
