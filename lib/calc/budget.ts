/**
 * Presupuesto: reglas puras.
 * - Presupuesto = importe fijo al mes por concepto (igual todos los meses).
 * - Gastado de un concepto = «Real» del Balance en ese mes (misma regla).
 * - Media: últimos 6 meses cerrados, sin meses atípicos (los que pasan del
 *   doble de la mediana), redondeada al euro. Sirve para rellenar importes.
 */
import type { ConceptSection } from "@/lib/labels";

export const WARN_RATIO = 0.85;

export type BudgetLine = {
  conceptId: string;
  name: string;
  section: ConceptSection;
  parentName: string | null;
  /** Real del mes. */
  spent: number;
  /** Presupuesto fijo al mes (null = sin presupuesto). */
  budget: number | null;
  /** Media de los 6 meses cerrados anteriores (null si no hubo gasto). */
  average: number | null;
  /** Concepto archivado en Balances (no se ofrece para añadir). */
  archived: boolean;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Media de los meses sin atípicos (> 2 × mediana), redondeada al euro. */
export function proposeFromHistory(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const kept = median > 0 ? values.filter((v) => v <= 2 * median) : values;
  const avg = kept.reduce((s, v) => s + v, 0) / kept.length;
  const rounded = Math.round(avg);
  return rounded > 0 ? rounded : null;
}
