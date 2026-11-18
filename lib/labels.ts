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

export const PERIODICITIES = ["mensual", "trimestral", "anual", "puntual"] as const;
export type Periodicity = (typeof PERIODICITIES)[number];
export const PERIODICITY_LABEL: Record<Periodicity, string> = {
  mensual: "Mensual",
  trimestral: "Trimestral",
  anual: "Anual",
  puntual: "Puntual",
};

export const LINK_SOURCE_LABEL = {
  movimientos: "Movimientos del banco",
  pagos: "Gastos apuntados a mano",
  supermercado: "Supermercado",
} as const;

/** Categorías de Supermercado (especificación, apartado 5): se agrupa SIEMPRE por catId. */
export const SUPER_CATEGORIES = [
  { id: "frutas", name: "Frutas y Verduras" },
  { id: "carnes", name: "Carnes y Aves" },
  { id: "pescados", name: "Pescados y Mariscos" },
  { id: "legumbres", name: "Pasta, legumbres y frutos secos" },
  { id: "lacteos", name: "Lácteos y Huevos" },
  { id: "embutidos", name: "Embutidos" },
  { id: "panaderia", name: "Panadería y Bollería" },
  { id: "bebidas", name: "Bebidas" },
  { id: "conservas", name: "Conservas" },
  { id: "snacks", name: "Snacks y Dulces" },
  { id: "limpieza", name: "Limpieza" },
  { id: "higiene", name: "Higiene y Cuidados" },
  { id: "congelados", name: "Alimentos congelados" },
  { id: "otros", name: "Otros" },
] as const;
export type SuperCategoryId = (typeof SUPER_CATEGORIES)[number]["id"];
export const SUPER_CATEGORY_NAME: Record<string, string> = Object.fromEntries(
  SUPER_CATEGORIES.map((c) => [c.id, c.name]),
);

export const PAYMENT_TYPES = ["tarjeta", "efectivo", "amex", "otros"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  tarjeta: "Tarjeta",
  efectivo: "Efectivo",
  amex: "Amex",
  otros: "Otros",
};

/** Valor del filtro «Cuenta» de Movimientos para ver solo los gastos apuntados a mano. */
export const MANUAL_ACCOUNT = "a-mano";
