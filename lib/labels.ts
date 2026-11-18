/** Etiquetas y valores permitidos compartidos entre servidor y cliente. */

export const FLOWS = {
  normal: "Normal",
  internal_transfer: "Traspaso propio",
  card_settlement: "Liquidación de tarjeta",
} as const;
export type Flow = keyof typeof FLOWS;

export function isFlow(v: unknown): v is Flow {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(FLOWS, v);
}

export type ConceptSection = "ingresos" | "gastos" | "ahorro";
export const SECTION_LABEL: Record<ConceptSection, string> = {
  ingresos: "Ingresos",
  gastos: "Gastos",
  ahorro: "Ahorro",
};
export const SECTION_ORDER: ConceptSection[] = ["ingresos", "gastos", "ahorro"];

export type ConceptOption = {
  id: string;
  name: string;
  section: ConceptSection;
  parentName: string | null;
};

export const ACCOUNT_TYPES = {
  personal: "Corriente",
  savings: "Ahorro",
  investment: "Inversión",
  loan: "Préstamo",
} as const;
export type AccountType = keyof typeof ACCOUNT_TYPES;

export type Account = { id: string; name: string; bank: string | null };

export type TxType = "ingreso" | "gasto" | "no-cuenta";

export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  accountId: string | null;
  conceptId: string | null;
  flow: Flow;
  note: string | null;
};
