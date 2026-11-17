/**
 * Único punto de acceso a datos de la app.
 *
 * Reglas (CLAUDE.md):
 * - Las pantallas no hacen consultas sueltas: importan desde aquí.
 * - Todas las funciones reciben un DataContext validado en el servidor y
 *   filtran por `owner` (Balance) y rol, aunque RLS sea todavía laxa.
 * - Solo `flow = 'normal'` cuenta en ingresos y gastos.
 * - Supermercado: `supermarket_purchases`, agrupado por `catId`.
 */
import "server-only";

export {
  getSession,
  getDataContext,
  assertOwner,
  type Session,
  type DataContext,
} from "./session";
