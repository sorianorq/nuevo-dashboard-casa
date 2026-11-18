import "server-only";
import { createHash } from "node:crypto";
import { importHashPayload } from "./normalize";

/** import_hash = sha256(cuenta|fecha|importe con 2 decimales|descripción normalizada). */
export function importHash(accountId: string, row: { date: string; amount: number; description: string }) {
  return createHash("sha256").update(importHashPayload(accountId, row)).digest("hex");
}
