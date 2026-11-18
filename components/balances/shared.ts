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

/** Texto de ayuda de una celda (title). */
export function cellNote(row: Pick<BalanceRow, "kind" | "linkSource" | "manualOverride">, monthIndex: number): string {
  if (row.kind === "subtotal") return "Suma de sus conceptos";
  if (row.kind === "manual") return "Importe escrito a mano";
  if (row.manualOverride[monthIndex]) return "Escrito a mano: manda sobre el automático";
  if (row.linkSource === "supermercado") return "Desde Supermercado";
  if (row.linkSource === "pagos") return "Apuntado a mano";
  return "Desde movimientos del banco";
}
