/**
 * Presupuesto (fase 5): reglas puras.
 * - Gastado de una partida = «Real» del Balance en ese mes (misma regla).
 * - Previsión a fin de mes (solo mes en curso): lo automático se proyecta al
 *   ritmo de los días transcurridos; lo escrito a mano (fijos) no.
 * - Propuesta: media de los últimos 6 meses cerrados, sin meses atípicos
 *   (los que pasan del doble de la mediana), redondeada al euro.
 */
import type { ConceptSection } from "@/lib/labels";

export const WARN_RATIO = 0.85;

export type BudgetLine = {
  conceptId: string;
  name: string;
  section: ConceptSection;
  parentName: string | null;
  linkSource: string | null;
  /** Real del mes (null en meses futuros). */
  spent: number | null;
  budget: number | null;
  /** Previsión a fin de mes (solo mes en curso). */
  forecast: number | null;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Gasto proyectado al ritmo del mes: automático × días del mes / días transcurridos. */
export function projectLine(spent: number, automatic: boolean, day: number, daysInMonth: number) {
  if (!automatic || day <= 0) return round2(spent);
  return round2((spent * daysInMonth) / day);
}

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
