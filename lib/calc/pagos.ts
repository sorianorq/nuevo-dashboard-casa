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
