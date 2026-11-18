/**
 * Hoja de Balance (fase 2): reglas de cálculo puras, sin acceso a datos.
 *
 * - Importes en positivo dentro de cada bloque (como en la versión anterior):
 *   un gasto de 50 € es 50 en Gastos; una devolución lo reduce.
 * - Concepto enlazado: real = suma de su origen (`link_source`), salvo que la
 *   celda tenga un importe escrito a mano en `andrea_balance`, que manda.
 * - Concepto manual: real = importe escrito a mano (0 si no hay, en meses ya
 *   empezados). Lo escrito a mano cuenta también en meses futuros.
 * - Subtotal: suma de sus hijos (real y presupuesto).
 * - Total de bloque: suma de las filas de primer nivel. Resultado =
 *   Ingresos − Gastos − Ahorro.
 * - Desvío = real − presupuesto, solo donde hay presupuesto y el mes ya ha
 *   empezado; un bloque o el resultado suman los desvíos de sus filas.
 */
import { SECTION_ORDER, type ConceptSection } from "@/lib/labels";

export const MONTHS = 12;

export type ConceptKind = "manual" | "linked" | "subtotal";
export type LinkSource = "movimientos" | "pagos" | "supermercado";

export type BalanceConcept = {
  id: string;
  name: string;
  section: ConceptSection;
  kind: ConceptKind;
  parentId: string | null;
  linkSource: LinkSource | null;
  sortOrder: number;
  archived: boolean;
  periodicity: string | null;
};

/** Doce valores (enero..diciembre); null = sin dato. */
export type MonthValues = (number | null)[];

export type BalanceInput = {
  concepts: BalanceConcept[];
  /** Suma del origen de cada concepto enlazado, ya en positivo por bloque. */
  linked: Map<string, number[]>;
  /** Importes escritos a mano (andrea_balance). */
  manual: Map<string, MonthValues>;
  /** Presupuesto (monthly_budgets). */
  budget: Map<string, MonthValues>;
  /** Meses del año ya empezados (1..12); los posteriores no tienen real ni desvío. */
  monthsElapsed: number;
  /** Incluir los archivados aunque no tengan importes en el año (para recuperarlos). */
  includeArchived?: boolean;
};

export type BalanceRow = {
  id: string;
  name: string;
  section: ConceptSection;
  periodicity: string | null;
  kind: ConceptKind;
  linkSource: LinkSource | null;
  parentId: string | null;
  depth: 0 | 1;
  archived: boolean;
  real: MonthValues;
  /** true en las celdas cuyo real es un importe escrito a mano sobre un enlazado. */
  manualOverride: boolean[];
  /** Suma del origen (solo enlazados, meses empezados), aunque haya importe a mano. */
  automatic: MonthValues;
  /** Lo escrito a mano en cada celda. */
  manual: MonthValues;
  budget: MonthValues;
  deviation: MonthValues;
  children: BalanceRow[];
};

export type BalanceTotals = { real: MonthValues; budget: MonthValues; deviation: MonthValues };

export type BalanceBlock = { section: ConceptSection; rows: BalanceRow[]; total: BalanceTotals };

export type BalanceSheet = { blocks: BalanceBlock[]; result: BalanceTotals; monthsElapsed: number };

const empty = (): MonthValues => Array.from({ length: MONTHS }, () => null);

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Suma celda a celda; null + null = null. */
function addValues(a: MonthValues, b: MonthValues): MonthValues {
  return a.map((x, i) => {
    const y = b[i];
    if (x === null && y === null) return null;
    return round2((x ?? 0) + (y ?? 0));
  });
}

function sumValues(list: MonthValues[]): MonthValues {
  return list.reduce(addValues, empty());
}

/** Total del año de una fila de valores (null si no hay ningún dato). */
export function yearTotal(values: MonthValues): number | null {
  return values.some((v) => v !== null) ? round2(values.reduce<number>((s, v) => s + (v ?? 0), 0)) : null;
}

function deviationOf(real: MonthValues, budget: MonthValues, monthsElapsed: number): MonthValues {
  return real.map((r, i) => (i < monthsElapsed && budget[i] !== null ? round2((r ?? 0) - (budget[i] as number)) : null));
}

function leafRow(c: BalanceConcept, input: BalanceInput): BalanceRow {
  const manual = input.manual.get(c.id) ?? empty();
  const linked = input.linked.get(c.id);
  const budget = input.budget.get(c.id) ?? empty();
  const real: MonthValues = empty();
  const manualOverride = Array.from({ length: MONTHS }, () => false);
  for (let i = 0; i < MONTHS; i++) {
    const elapsed = i < input.monthsElapsed;
    // Lo escrito a mano cuenta en cualquier mes (también futuros, como en la
    // versión anterior); lo automático, solo en meses ya empezados.
    if (manual[i] !== null) {
      real[i] = manual[i];
      manualOverride[i] = c.kind === "linked";
    } else if (elapsed) {
      real[i] = c.kind === "linked" ? round2(linked?.[i] ?? 0) : 0;
    }
  }
  return {
    id: c.id,
    name: c.name,
    section: c.section,
    periodicity: c.periodicity,
    kind: c.kind,
    linkSource: c.linkSource,
    parentId: c.parentId,
    depth: 0,
    archived: c.archived,
    real,
    manualOverride,
    automatic: real.map((_, i) => (c.kind === "linked" && i < input.monthsElapsed ? round2(linked?.[i] ?? 0) : null)),
    manual,
    budget,
    deviation: deviationOf(real, budget, input.monthsElapsed),
    children: [],
  };
}

function hasData(row: BalanceRow) {
  return [...row.real, ...row.budget].some((v) => v !== null && v !== 0);
}

const byOrder = (a: BalanceConcept, b: BalanceConcept) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es");

/** Construye la hoja anual de un Balance. */
export function buildBalanceSheet(input: BalanceInput): BalanceSheet {
  const keep = (r: BalanceRow) => !r.archived || input.includeArchived || hasData(r);
  const ids = new Set(input.concepts.map((c) => c.id));
  const subtotalIds = new Set(input.concepts.filter((c) => c.kind === "subtotal").map((c) => c.id));
  // Un hijo cuyo padre no existe (o no es subtotal) se muestra en primer nivel.
  const parentOf = (c: BalanceConcept) => (c.parentId && ids.has(c.parentId) && subtotalIds.has(c.parentId) ? c.parentId : null);

  const blocks: BalanceBlock[] = SECTION_ORDER.map((section) => {
    const concepts = input.concepts.filter((c) => c.section === section).sort(byOrder);
    const rows: BalanceRow[] = [];
    for (const c of concepts.filter((x) => parentOf(x) === null)) {
      if (c.kind === "subtotal") {
        const children = concepts
          .filter((x) => parentOf(x) === c.id && x.kind !== "subtotal")
          .map((x) => ({ ...leafRow(x, input), depth: 1 as const }))
          .filter(keep);
        const real = sumValues(children.map((r) => r.real));
        const budget = sumValues(children.map((r) => r.budget));
        const row: BalanceRow = {
          id: c.id,
          name: c.name,
          section: c.section,
          periodicity: c.periodicity,
          kind: "subtotal",
          linkSource: null,
          parentId: null,
          depth: 0,
          archived: c.archived,
          real,
          manualOverride: Array.from({ length: MONTHS }, () => false),
          automatic: empty(),
          manual: empty(),
          budget,
          deviation: sumValues(children.map((r) => r.deviation)),
          children,
        };
        if (keep(row)) rows.push(row);
      } else {
        const row = leafRow(c, input);
        if (keep(row)) rows.push(row);
      }
    }
    const total: BalanceTotals = {
      real: sumValues(rows.map((r) => r.real)),
      budget: sumValues(rows.map((r) => r.budget)),
      deviation: sumValues(rows.map((r) => r.deviation)),
    };
    return { section, rows, total };
  });

  const [ing, gas, aho] = blocks.map((b) => b.total);
  const combine = (key: keyof BalanceTotals) =>
    ing[key].map((x, i) => {
      const parts = [x, gas[key][i], aho[key][i]];
      if (parts.every((p) => p === null)) return null;
      return round2((x ?? 0) - (gas[key][i] ?? 0) - (aho[key][i] ?? 0));
    });

  return {
    blocks,
    result: { real: combine("real"), budget: combine("budget"), deviation: combine("deviation") },
    monthsElapsed: input.monthsElapsed,
  };
}

/**
 * Importe de un movimiento del banco en el signo del bloque: en Ingresos
 * cuenta tal cual; en Gastos y Ahorro, un cargo (negativo) suma en positivo.
 */
export function movementInSection(amount: number, section: ConceptSection): number {
  return section === "ingresos" ? amount : -amount;
}
