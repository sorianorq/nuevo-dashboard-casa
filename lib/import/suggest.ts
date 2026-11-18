/**
 * Concepto sugerido por historial (especificación, apartado 7). Sin reglas
 * fijas: se busca el movimiento anterior más parecido del mismo Balance.
 *  1. Misma descripción normalizada → su concepto (el más reciente).
 *  2. Si no, similitud de texto (palabras en común) ≥ umbral → el mejor.
 */
import { normalizeDescription, tokens, tokenSimilarity } from "./normalize";

export type HistoryRow = { description: string; conceptId: string; date: string };
export type Suggestion = { conceptId: string; source: "exact" | "similar"; score: number } | null;

export const SIMILARITY_THRESHOLD = 0.6;

export function buildSuggester(history: HistoryRow[]) {
  // Más reciente primero: en empate gana el último uso.
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const exact = new Map<string, string>();
  const byToken = new Map<string, number[]>();
  const tokenized = sorted.map((h) => tokens(h.description));

  sorted.forEach((h, i) => {
    const key = normalizeDescription(h.description);
    if (!exact.has(key)) exact.set(key, h.conceptId);
    for (const t of tokenized[i]) {
      const list = byToken.get(t);
      if (list) list.push(i);
      else byToken.set(t, [i]);
    }
  });

  return function suggest(description: string): Suggestion {
    const hit = exact.get(normalizeDescription(description));
    if (hit) return { conceptId: hit, source: "exact", score: 1 };

    const own = tokens(description);
    const candidates = new Set<number>();
    for (const t of own) for (const i of byToken.get(t) ?? []) candidates.add(i);

    let best: { i: number; score: number } | null = null;
    for (const i of candidates) {
      const score = tokenSimilarity(own, tokenized[i]);
      // Candidatos en orden de inserción (más recientes primero): solo se
      // reemplaza con una puntuación estrictamente mayor.
      if (!best || score > best.score || (score === best.score && i < best.i)) best = { i, score };
    }
    if (best && best.score >= SIMILARITY_THRESHOLD) {
      return { conceptId: sorted[best.i].conceptId, source: "similar", score: best.score };
    }
    return null;
  };
}
