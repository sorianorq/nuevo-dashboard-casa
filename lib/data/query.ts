import "server-only";

const PAGE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Lee todas las filas de una consulta paginando con .range(): PostgREST
 * devuelve como máximo 1000 filas por petición y cortaría los totales en
 * silencio. `build(from, to)` debe crear la consulta con un orden estable.
 */
export async function fetchAll<T>(build: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`Error de base de datos: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** numeric de Postgres → number (PostgREST puede devolverlo como texto). */
export function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
