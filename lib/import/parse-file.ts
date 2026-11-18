/**
 * Lectura de extractos en el navegador: CSV, XLS, XLSX y los .xls de los
 * bancos que en realidad son HTML. El archivo no sale del navegador; al
 * servidor solo llegan las filas ya normalizadas.
 *
 * Misma secuencia que la app anterior (para que el texto de cada celda, y
 * por tanto el import_hash, coincida): SheetJS primero; si salen fragmentos
 * HTML o una sola columna, se lee como tabla HTML.
 */
import { looksMisdecoded, normalizeMatrix, type Matrix } from "./normalize";

export type FileMatrix = {
  matrix: Matrix;
  /** Lectura como la hacía la app anterior, solo si difiere (CSV UTF-8). */
  legacyMatrix: Matrix | null;
};

export async function readFileMatrix(file: File): Promise<FileMatrix> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  let matrix: Matrix = [];
  let legacyMatrix: Matrix | null = null;

  const toMatrix = (workbook: import("xlsx").WorkBook): Matrix => {
    const first = workbook.SheetNames[0];
    if (!first) return [];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[first], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
    return normalizeMatrix(raw);
  };

  try {
    matrix = toMatrix(XLSX.read(buffer, { type: "array", raw: false, dense: true }));
    // CSV en UTF-8 leído como Windows-1252: se relee bien y se guarda la
    // lectura antigua para detectar duplicados importados con la app anterior.
    if (matrix.length && looksMisdecoded(matrix)) {
      const utf8 = decodeUtf8Strict(buffer);
      if (utf8 !== null) {
        const clean = toMatrix(XLSX.read(utf8, { type: "string", raw: false, dense: true }));
        if (clean.length === matrix.length) {
          legacyMatrix = matrix;
          matrix = clean;
        }
      }
    }
  } catch {
    // Se intenta como HTML más abajo.
  }

  if (matrix.length && containsHtmlFragments(matrix)) {
    const html = reconstructHtmlFromFragmentCells(matrix);
    if (html) {
      const htmlMatrix = extractBestHtmlTable(html);
      if (htmlMatrix.length > 0) {
        matrix = htmlMatrix;
        legacyMatrix = null;
      }
    }
  }

  if (!matrix.length || shouldFallbackToHtml(matrix)) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const sample = text.slice(0, 20000).toLowerCase();
    if (["<html", "<table", "<!doctype html", "<td", "<tr"].some((s) => sample.includes(s))) {
      const htmlMatrix = extractBestHtmlTable(text);
      if (htmlMatrix.length > 0) {
        matrix = htmlMatrix;
        legacyMatrix = null;
      }
    }
  }

  return { matrix, legacyMatrix };
}

function decodeUtf8Strict(buffer: ArrayBuffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function extractBestHtmlTable(html: string): Matrix {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let best: Matrix = [];
  doc.querySelectorAll("table").forEach((table) => {
    const matrix: Matrix = [];
    table.querySelectorAll("tr").forEach((tr) => {
      const row: string[] = [];
      tr.querySelectorAll("th, td").forEach((cell) => {
        row.push((cell.textContent ?? "").replace(/\s+/g, " ").trim());
      });
      if (row.some((c) => c !== "")) matrix.push(row);
    });
    if (matrix.length > best.length) best = matrix;
  });
  return best;
}

function shouldFallbackToHtml(matrix: Matrix) {
  if (!matrix.length) return true;
  const meaningful = matrix.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (!meaningful.length) return true;
  const avgCols = meaningful.reduce((acc, row) => acc + row.length, 0) / meaningful.length;
  return avgCols <= 1.2;
}

function containsHtmlFragments(matrix: Matrix) {
  const sample = matrix.slice(0, 20).flat().join(" ").toLowerCase();
  return (
    sample.includes("<td") ||
    sample.includes("<tr") ||
    sample.includes("<table") ||
    sample.includes("<font") ||
    sample.includes("tdnowrap") ||
    sample.includes("cuerpodetalletitulo") ||
    sample.includes("vertical-align:middle")
  );
}

function reconstructHtmlFromFragmentCells(matrix: Matrix) {
  const raw = matrix.flat().join(" ");
  if (!raw.trim()) return "";
  const normalized = raw.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
  if (normalized.includes("<table")) return normalized;
  if (normalized.includes("<tr") || normalized.includes("<td")) {
    return `<table><tbody>${normalized}</tbody></table>`;
  }
  return "";
}
