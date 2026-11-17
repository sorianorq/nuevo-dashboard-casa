/**
 * Utilidades de meses y fechas sin zona horaria: las fechas de la base de
 * datos son `date` ('YYYY-MM-DD') y se comparan como texto.
 * «Hoy» se calcula en Europe/Madrid.
 */

export type YearMonth = { year: number; month: number }; // month 1..12

export const TIME_ZONE = "Europe/Madrid";

/** Fecha de hoy en Madrid: 'YYYY-MM-DD'. */
export function todayIso(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function ymOf(isoDate: string): YearMonth {
  return { year: Number(isoDate.slice(0, 4)), month: Number(isoDate.slice(5, 7)) };
}

export function ymKey({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** '2026-03' → {2026, 3}; null si no es válido. */
export function parseYm(value: unknown): YearMonth | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { year, month };
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareYm(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function daysInMonth({ year, month }: YearMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Primer día del mes: 'YYYY-MM-01'. */
export function monthStart(ym: YearMonth): string {
  return `${ymKey(ym)}-01`;
}

/** Último día del mes: 'YYYY-MM-DD'. */
export function monthEnd(ym: YearMonth): string {
  return `${ymKey(ym)}-${String(daysInMonth(ym)).padStart(2, "0")}`;
}

/** Los `count` meses que terminan en `last` (incluido), en orden. */
export function monthsEndingAt(last: YearMonth, count: number): YearMonth[] {
  return Array.from({ length: count }, (_, i) => addMonths(last, i - (count - 1)));
}
