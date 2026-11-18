/**
 * Normalización de extractos bancarios. Funciones puras, válidas en
 * navegador y servidor.
 *
 * Compatibilidad con lo ya guardado:
 *   - import_templates: la app en producción guarda las columnas como letras
 *     (A, B…) y la app Next anterior como nombres de cabecera. Se leen ambos
 *     formatos y se guarda en letras (lo entienden las dos).
 *   - Duplicados: los import_hash existentes tienen formatos distintos, así
 *     que además del hash se compara la clave fecha|importe|descripción
 *     normalizada con los movimientos ya guardados en la cuenta (igual que
 *     hace la app en producción).
 * parseNumber, excelDateToISO y la lectura de celdas replican la app Next
 * anterior.
 */

export type Matrix = string[][];

export type ImportMapping = {
  date: string | null;
  description: string | null;
  amount: string | null;
  balance: string | null;
};

export type ImportTemplate = {
  headerRow: number; // 1-based
  dataStartRow: number; // 1-based
  startColumn: string; // 'A'
  mapping: ImportMapping;
};

export type ParsedRow = {
  /** Fila del archivo (1-based) para mostrar errores. */
  line: number;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  balance: number | null;
  /**
   * Descripción tal como la leía la app anterior cuando el CSV es UTF-8 y
   * SheetJS lo decodificaba como Windows-1252 («NÃ³mina»). Solo sirve para
   * detectar duplicados importados entonces; se guarda la descripción limpia.
   */
  legacyDescription?: string;
};

export function columnLetterToIndex(letter: string) {
  const clean = (letter || "A").trim().toUpperCase();
  let result = 0;
  for (let i = 0; i < clean.length; i++) {
    result = result * 26 + (clean.charCodeAt(i) - 64);
  }
  return Math.max(result - 1, 0);
}

export function indexToColumnLetter(index: number) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;

  let str = String(value).trim();
  if (!str) return null;

  str = str
    .replace(/\s/g, "")
    .replace(/[€$£¥]/g, "")
    .replace(/[^0-9,.\-]/g, "");
  if (!str) return null;

  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");
    if (lastComma > lastDot) str = str.replace(/\./g, "").replace(",", ".");
    else str = str.replace(/,/g, "");
  } else if (hasComma) {
    const parts = str.split(",");
    if (parts.length === 2 && parts[1].length <= 2) str = str.replace(",", ".");
    else str = str.replace(/,/g, "");
  } else if (hasDot) {
    const parts = str.split(".");
    if (!(parts.length === 2 && parts[1].length <= 2)) str = str.replace(/\./g, "");
  }

  const parsed = Number(str);
  return Number.isNaN(parsed) ? null : parsed;
}

export function excelDateToISO(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().slice(0, 10);
  }

  const str = String(value).trim();
  if (!str) return null;

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return str;

  const esMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (esMatch) {
    const day = esMatch[1].padStart(2, "0");
    const month = esMatch[2].padStart(2, "0");
    const year = esMatch[3].length === 2 ? `20${esMatch[3]}` : esMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/** Descripción normalizada: sin espacios sobrantes y en minúsculas. */
export function normalizeDescription(description: string) {
  return description.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Texto del import_hash (especificación, apartado 6):
 * cuenta|fecha|importe con 2 decimales|descripción normalizada.
 */
export function importHashPayload(accountId: string, row: { date: string; amount: number; description: string }) {
  return [accountId, row.date, row.amount.toFixed(2), normalizeDescription(row.description)].join("|");
}

/** Clave para comparar con movimientos ya guardados en la misma cuenta. */
export function duplicateKey(date: string, amount: number, description: string) {
  return [date.slice(0, 10), Number(amount).toFixed(2), normalizeDescription(description)].join("|");
}

export function normalizeMatrix(matrix: unknown[][]): Matrix {
  const maxCols = Math.max(...matrix.map((row) => row.length), 0);
  return matrix.map((row) =>
    Array.from({ length: maxCols }, (_, i) => {
      const value = row[i];
      return value === null || value === undefined ? "" : String(value).trim();
    }),
  );
}

export function makeUniqueColumns(columns: string[]) {
  const seen = new Map<string, number>();
  return columns.map((column, index) => {
    const base = column && column.trim() !== "" ? column.trim() : `column_${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

export function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fila de cabecera más probable (0-based), como la app anterior. */
export function detectBestHeaderRow(matrix: Matrix) {
  const keywords = [
    "fecha",
    "fecha operacion",
    "fecha valor",
    "f operativa",
    "concepto",
    "descripcion",
    "importe",
    "saldo",
    "balance",
    "valor",
  ];
  let bestRowIndex = -1;
  let bestScore = -1;

  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 30); rowIndex++) {
    const normalizedCells = matrix[rowIndex].map((cell) => normalizeHeader(cell));
    const nonEmpty = normalizedCells.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    let score = 0;
    for (const cell of normalizedCells) {
      if (!cell) continue;
      if (keywords.includes(cell)) score += 8;
      for (const keyword of keywords) if (cell.includes(keyword)) score += 3;
    }
    score += nonEmpty.length;
    const joined = normalizedCells.join(" | ");
    if (
      joined.includes("fecha operacion") ||
      joined.includes("fecha valor") ||
      joined.includes("concepto") ||
      joined.includes("importe") ||
      joined.includes("saldo")
    ) {
      score += 20;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = rowIndex;
    }
  }
  return bestRowIndex >= 0 ? bestRowIndex : 0;
}

/** Propone el mapeo de columnas a partir de los nombres de cabecera. */
export function guessMapping(columns: string[]): ImportMapping {
  const find = (tests: ((h: string) => boolean)[]) => {
    for (const test of tests) {
      const hit = columns.find((c) => test(normalizeHeader(c)));
      if (hit) return hit;
    }
    return null;
  };
  return {
    date: find([(h) => h === "fecha", (h) => h.includes("fecha operacion"), (h) => h.includes("f operativa"), (h) => h.startsWith("fecha")]),
    description: find([(h) => h === "concepto", (h) => h.includes("descripcion"), (h) => h.includes("concepto")]),
    amount: find([(h) => h === "importe", (h) => h.includes("importe")]),
    balance: find([(h) => h === "saldo", (h) => h.includes("saldo"), (h) => h === "balance"]),
  };
}

export function buildRowsFromMatrix(
  matrix: Matrix,
  headerRow: number,
  dataStartRow: number,
  startColumn: string,
) {
  const startIndex = columnLetterToIndex(startColumn);
  const headerIndex = Math.max(headerRow - 1, 0);
  const dataIndex = Math.max(dataStartRow - 1, 0);

  if (!matrix[headerIndex]) {
    return { columns: [] as string[], rows: [] as { line: number; record: Record<string, string> }[] };
  }

  const columns = makeUniqueColumns(matrix[headerIndex].slice(startIndex));
  const rows = matrix
    .slice(dataIndex)
    .map((row, i) => ({ line: dataIndex + i + 1, cells: row.slice(startIndex) }))
    .filter(({ cells }) => cells.some((cell) => String(cell ?? "").trim() !== ""))
    .map(({ line, cells }) => {
      const record: Record<string, string> = {};
      columns.forEach((column, index) => {
        record[column] = cells[index] ?? "";
      });
      return { line, record };
    });

  return { columns, rows };
}

/**
 * Aplica plantilla y mapeo. Devuelve filas válidas e inválidas (sin fecha,
 * descripción o importe), igual criterio que la app anterior.
 */
export function extractRows(matrix: Matrix, template: ImportTemplate, legacyMatrix: Matrix | null = null) {
  const { rows, columns } = buildRowsFromMatrix(matrix, template.headerRow, template.dataStartRow, template.startColumn);
  const legacy = legacyDescriptions(legacyMatrix, template, columns);
  const { date, description, amount, balance } = template.mapping;
  const valid: ParsedRow[] = [];
  const invalid: number[] = [];
  if (!date || !description || !amount) return { valid, invalid };

  for (const { line, record } of rows) {
    const d = excelDateToISO(record[date]);
    const desc = String(record[description] ?? "").trim();
    const amt = parseNumber(record[amount]);
    const bal = balance ? parseNumber(record[balance]) : null;
    if (!d || !desc || amt === null) {
      invalid.push(line);
      continue;
    }
    const old = legacy?.get(line);
    valid.push({
      line,
      date: d,
      description: desc,
      amount: amt,
      balance: bal,
      ...(old && old !== desc ? { legacyDescription: old } : {}),
    });
  }
  return { valid, invalid };
}

/** Descripciones de la lectura antigua por fila, con la columna en la misma posición. */
function legacyDescriptions(legacyMatrix: Matrix | null, template: ImportTemplate, columns: string[]) {
  if (!legacyMatrix || !template.mapping.description) return null;
  const index = columns.indexOf(template.mapping.description);
  if (index < 0) return null;
  const built = buildRowsFromMatrix(legacyMatrix, template.headerRow, template.dataStartRow, template.startColumn);
  const name = built.columns[index];
  if (!name) return null;
  return new Map(built.rows.map(({ line, record }) => [line, String(record[name] ?? "").trim()]));
}

/**
 * Traduce una plantilla guardada a los nombres de columna de este archivo:
 *  - nombre de cabecera (app Next anterior) → se usa tal cual;
 *  - nombre mal decodificado («Fecha operaciÃ³n») → el limpio de la misma posición;
 *  - letra (app en producción, columna absoluta desde A) → su cabecera.
 */
export function adaptTemplate(t: ImportTemplate, columns: string[], legacyColumns: string[] | null): ImportTemplate {
  const start = columnLetterToIndex(t.startColumn);
  const fix = (name: string | null) => {
    if (!name || columns.includes(name)) return name;
    const i = legacyColumns?.indexOf(name) ?? -1;
    if (i >= 0 && columns[i]) return columns[i];
    if (/^[A-Z]{1,3}$/.test(name)) {
      const rel = columnLetterToIndex(name) - start;
      if (rel >= 0 && columns[rel]) return columns[rel];
    }
    return name;
  };
  return {
    ...t,
    mapping: {
      date: fix(t.mapping.date),
      description: fix(t.mapping.description),
      amount: fix(t.mapping.amount),
      balance: fix(t.mapping.balance),
    },
  };
}

/** Plantilla para guardar: columnas como letras absolutas (formato de producción). */
export function templateWithLetters(t: ImportTemplate, columns: string[]): ImportTemplate | null {
  const start = columnLetterToIndex(t.startColumn);
  const letter = (name: string | null) => {
    if (!name) return null;
    const i = columns.indexOf(name);
    return i >= 0 ? indexToColumnLetter(start + i) : undefined;
  };
  const mapping = {
    date: letter(t.mapping.date),
    description: letter(t.mapping.description),
    amount: letter(t.mapping.amount),
    balance: letter(t.mapping.balance) ?? null,
  };
  if (!mapping.date || !mapping.description || !mapping.amount) return null;
  return { ...t, mapping: mapping as ImportMapping };
}

/** Texto UTF-8 leído como Windows-1252 (Ã³, Ã±, â‚¬…). */
export function looksMisdecoded(matrix: Matrix) {
  const sample = matrix.slice(0, 200).flat().join(" ");
  return /Ã[\u0080-\u00BF]|Â[\u00A0-\u00BF]|â‚¬|â€/.test(sample);
}

// --- Similitud para sugerir conceptos (no afecta al hash) -----------------

const STOP = new Set(["de", "la", "el", "en", "y", "a", "con", "por", "del", "los", "las", "sl", "sa", "es", "com", "www"]);

/** Clave para «movimientos parecidos»: sin acentos, cifras ni signos. */
export function similarityKey(description: string) {
  return normalizeHeader(description)
    .replace(/[0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(description: string): string[] {
  return [...new Set(similarityKey(description).split(" ").filter((t) => t.length > 1 && !STOP.has(t)))];
}

/** Coeficiente de Dice entre conjuntos de palabras (0..1). */
export function tokenSimilarity(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((t) => setB.has(t)).length;
  return (2 * shared) / (a.length + b.length);
}
