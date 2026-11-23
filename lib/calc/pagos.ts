/**
 * Pagos (fase 4): tipos y reglas puras, válidas en servidor y navegador.
 * Tabla `amex_expenses`: `wallet = 'amex'` → American Express (compartida);
 * `wallet = andrea | ricardo` → Pagos personales de esa persona.
 */
import { OWNER_LABEL, type Owner, type Person } from "@/lib/balance";

/** Quién pagó. «otros» solo existe en gastos antiguos (decisión de Ricardo, 18/11/2026). */
export type PaidBy = Person | "otros";

export const PAID_BY_LABEL: Record<PaidBy, string> = { andrea: "Andrea", ricardo: "Ricardo", otros: "Otros" };

export function isPaidBy(v: unknown): v is PaidBy {
  return v === "andrea" || v === "ricardo" || v === "otros";
}

/** Concepto de Pagos de un Balance (enlazado con origen Pagos). */
export type PagosConcept = { id: string; owner: Owner; name: string; archived: boolean; sortOrder: number };

export type Payment = {
  id: string;
  date: string;
  description: string;
  amount: number;
  paidBy: PaidBy | null;
  pending: boolean;
  comment: string | null;
  conceptId: string | null;
  /** Compra de Supermercado de la que sale (se edita desde Supermercado). */
  purchaseId: string | null;
  wallet: string;
  paymentMethodId: string | null;
};

export type PaymentMethodKind = "tarjeta" | "efectivo" | "otro";
export const PAYMENT_METHOD_KINDS: PaymentMethodKind[] = ["tarjeta", "efectivo", "otro"];
export const PAYMENT_METHOD_KIND_LABEL: Record<PaymentMethodKind, string> = { tarjeta: "Tarjeta", efectivo: "Efectivo", otro: "Otro" };

/** Medio de pago de una persona (`payment_methods`). */
export type PaymentMethod = { id: string; name: string; kind: PaymentMethodKind; archived: boolean };

export type ConceptRef = { owner: Owner; name: string };

/** Nombre de «Otros gastos» (el concepto por defecto de cada Balance). */
export const OTHERS_NAME = "Otros gastos";
export const isOthersName = (name: string) => name.trim().toLowerCase() === OTHERS_NAME.toLowerCase();

/** «Ocio» si el concepto es del Balance de quien pagó; si no, «Casa › Ocio». */
export function conceptLabel(ref: ConceptRef | undefined, paidBy: PaidBy | null): string {
  if (!ref) return "Sin concepto";
  return ref.owner === paidBy ? ref.name : `${OWNER_LABEL[ref.owner]} › ${ref.name}`;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Balance de un gasto apuntado a mano: el de su concepto; sin concepto, el de
 * quien pagó. Las compras del Súper y los antiguos «otros», Casa.
 */
export function balanceOf(p: Payment, refs: Record<string, ConceptRef>): Owner {
  const ref = p.conceptId ? refs[p.conceptId] : undefined;
  if (ref) return ref.owner;
  if (p.purchaseId || p.paidBy === null || p.paidBy === "otros") return "casa";
  return p.paidBy;
}

// --- Amex: quién paga y periodo (decisiones de Ricardo, 23/11/2026) ----------

/**
 * Quién paga un gasto de la Amex: Ricardo o Andrea (lo traspasan desde su
 * cuenta a la de Casa, donde se carga la Amex) o Casa (sin traspaso; en la base
 * de datos, `paid_by = 'otros'`).
 */
export type AmexPayer = Owner;
export function amexPayer(p: Pick<Payment, "paidBy">): AmexPayer {
  return p.paidBy === "andrea" || p.paidBy === "ricardo" ? p.paidBy : "casa";
}

/** Día de corte del extracto de la Amex: el periodo va del 27 al 26 y se cobra hacia el 2. */
export const AMEX_CUTOFF_DAY = 26;

/** Periodo de la Amex que cierra el día de corte del mes `ym`: del 27 del mes anterior al 26. */
export function amexPeriod(ym: { year: number; month: number }): { from: string; to: string } {
  const prev = ym.month === 1 ? { year: ym.year - 1, month: 12 } : { year: ym.year, month: ym.month - 1 };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${prev.year}-${pad(prev.month)}-${pad(AMEX_CUTOFF_DAY + 1)}`,
    to: `${ym.year}-${pad(ym.month)}-${pad(AMEX_CUTOFF_DAY)}`,
  };
}

/** Periodo de la Amex en el que cae una fecha (el que cierra ese mes o el siguiente). */
export function amexPeriodOf(isoDate: string): { year: number; month: number } {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (d <= AMEX_CUTOFF_DAY) return { year: y, month: m };
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

export type AmexPersonCycle = { total: number; transferred: number; pending: number };
/** Cuadre de un periodo: por persona, total / traspasado / pendiente; y lo de Casa. */
export function amexCycle(rows: Payment[]): { ricardo: AmexPersonCycle; andrea: AmexPersonCycle; casa: number; total: number } {
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const person = (who: "ricardo" | "andrea"): AmexPersonCycle => {
    const mine = rows.filter((p) => amexPayer(p) === who);
    const total = r2(mine.reduce((s, p) => s + p.amount, 0));
    const pending = r2(mine.filter((p) => p.pending).reduce((s, p) => s + p.amount, 0));
    return { total, transferred: r2(total - pending), pending };
  };
  return {
    ricardo: person("ricardo"),
    andrea: person("andrea"),
    casa: r2(rows.filter((p) => amexPayer(p) === "casa").reduce((s, p) => s + p.amount, 0)),
    total: r2(rows.reduce((s, p) => s + p.amount, 0)),
  };
}
