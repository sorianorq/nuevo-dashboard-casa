/**
 * Formato es-ES de importes, porcentajes y fechas (especificación, apartado 1).
 *
 * - Importes con 2 decimales y separador de miles siempre: 1.234,56 €
 *   (Intl en es-ES no agrupa los números de 4 cifras si no se fuerza).
 * - Signo de gasto: «−» (U+2212), no el guion.
 * - Fechas dd/mm/aaaa. Las fechas de la base de datos son `date`
 *   ('YYYY-MM-DD'): se tratan como texto para no depender de la zona horaria.
 */

const MINUS = "−";

const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

const currencyRounded = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: "always",
});

const decimal1 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: "always",
});

/** 1.234,56 € · negativos con «−». */
export function formatAmount(value: number): string {
  const text = currency.format(Math.abs(value));
  return value < 0 && !isZero(value) ? `${MINUS}${text}` : text;
}

/** Igual sin decimales (ejes de gráficos, cifras compactas). */
export function formatAmountRounded(value: number): string {
  const text = currencyRounded.format(Math.abs(value));
  return value < 0 && Math.round(value) !== 0 ? `${MINUS}${text}` : text;
}

/** Con signo explícito: «+1.234,56 €» / «−1.234,56 €». Cero sin signo. */
export function formatSignedAmount(value: number): string {
  if (isZero(value)) return currency.format(0);
  return `${value > 0 ? "+" : MINUS}${currency.format(Math.abs(value))}`;
}

/** Proporción (0,1234) → «12,3 %». */
export function formatPercent(ratio: number): string {
  const text = `${decimal1.format(Math.abs(ratio * 100))} %`;
  return ratio < 0 && !isZero(ratio * 100, 0.05) ? `${MINUS}${text}` : text;
}

/** Proporción con signo: «+12,3 %» / «−4,0 %». */
export function formatSignedPercent(ratio: number): string {
  const pct = ratio * 100;
  if (isZero(pct, 0.05)) return `${decimal1.format(0)} %`;
  return `${pct > 0 ? "+" : MINUS}${decimal1.format(Math.abs(pct))} %`;
}

/** Diferencia en puntos porcentuales: «+2,5 p.p.». Recibe puntos (2.5). */
export function formatPoints(points: number): string {
  if (isZero(points, 0.05)) return `${decimal1.format(0)} p.p.`;
  return `${points > 0 ? "+" : MINUS}${decimal1.format(Math.abs(points))} p.p.`;
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/** (2026, 3) → «marzo 2026». Mes de 1 a 12. */
export function formatMonth(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

/** (2026, 3) → «Marzo 2026». */
export function formatMonthTitle(year: number, month: number): string {
  const text = formatMonth(year, month);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** (2026, 3) → «mar 26». */
export function formatMonthShort(year: number, month: number): string {
  return `${MONTHS_SHORT[month - 1]} ${String(year).slice(2)}`;
}

/** 'YYYY-MM-DD' → «martes, 3 de marzo» (cabeceras de lista por día). */
export function formatDayHeading(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const text = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isZero(value: number, epsilon = 0.005) {
  return Math.abs(value) < epsilon;
}

const compact = new Intl.NumberFormat("es-ES", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Ejes de gráficos: «1,2 mil €», «850 €». */
export function formatAmountCompact(value: number): string {
  const text = `${compact.format(Math.abs(value))} €`;
  return value < 0 && Math.round(value) !== 0 ? `${MINUS}${text}` : text;
}

const integer = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: "always",
});

/** Celdas de la hoja anual: «1.235» / «−80» (redondeado al euro, sin «€»). */
export function formatCellRounded(value: number): string {
  const text = integer.format(Math.abs(value));
  return value < 0 && Math.round(value) !== 0 ? `${MINUS}${text}` : text;
}

/** Igual con signo explícito (desvíos): «+120» / «−35». Cero sin signo. */
export function formatCellSigned(value: number): string {
  if (Math.round(value) === 0) return integer.format(0);
  return `${value > 0 ? "+" : MINUS}${integer.format(Math.abs(value))}`;
}
