import "server-only";
import { createHash } from "node:crypto";
import { importHashPayload } from "./normalize";

/**
 * import_hash = sha256(cuenta|fecha|importe con 2 decimales|descripción normalizada).
 * Si el mismo archivo trae varias filas idénticas, la primera usa ese hash y las
 * siguientes añaden su número de aparición (|2, |3…), para poder guardarlas todas
 * sin chocar con la restricción única (account_id, import_hash).
 */
export function importHash(
  accountId: string,
  row: { date: string; amount: number; description: string },
  occurrence = 1,
) {
  const payload = importHashPayload(accountId, row) + (occurrence > 1 ? `|${occurrence}` : "");
  return createHash("sha256").update(payload).digest("hex");
}
