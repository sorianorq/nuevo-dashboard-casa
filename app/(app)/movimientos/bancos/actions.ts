"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import {
  bankSessionExternalId,
  createPendingBankSession,
  dropBankSession,
  getDataContext,
  setBankLink,
} from "@/lib/data";
import { BankError, closeSession, listBanks, newState, startAuth } from "@/lib/banking/enable-banking";

/**
 * Bancos conectados (Enable Banking). Cada acción vuelve a leer la sesión;
 * las tablas solo dejan ver las conexiones propias (RLS).
 */

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo completar la acción." };
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

async function requestInfo() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return {
    redirectUrl: process.env.ENABLE_BANKING_REDIRECT_URL || `${proto}://${host}/api/banco/callback`,
    psu: { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null, userAgent: h.get("user-agent") },
  };
}

/** Empieza la conexión: devuelve la página del banco a la que ir. */
export async function connectBank(aspsp: string) {
  return run(async () => {
    const ctx = await getDataContext();
    if (typeof aspsp !== "string" || !aspsp.trim() || aspsp.length > 200) throw new Error("Elige un banco.");
    try {
      const bank = (await listBanks("ES")).find((b) => b.name === aspsp);
      if (!bank) throw new Error("Ese banco no está en la lista.");
      const state = newState();
      await createPendingBankSession(ctx, bank.name, bank.country, state);
      const { redirectUrl, psu } = await requestInfo();
      // Permiso por el máximo que admita el banco, hasta 180 días.
      const days = Math.max(1, Math.min(bank.maxDays ?? 90, 180));
      const url = await startAuth({ aspsp: bank.name, country: bank.country, state, redirectUrl, days }, psu);
      return { url };
    } catch (e) {
      if (e instanceof BankError) throw new Error(e.message);
      throw e;
    }
  });
}

/** Une una cuenta del banco con una cuenta de la app (o la suelta, con null). */
export async function linkBankAccount(bankSessionId: string, ebAccountUid: string, accountId: string | null) {
  return run(async () => {
    if (!isUuid(bankSessionId) || typeof ebAccountUid !== "string" || ebAccountUid.length > 100) throw new Error("Datos no válidos.");
    if (accountId !== null && !isUuid(accountId)) throw new Error("Cuenta no válida.");
    const ctx = await getDataContext();
    await setBankLink(ctx, bankSessionId, ebAccountUid, accountId);
    refresh();
    return {};
  });
}

/** Quita la conexión: cierra el permiso en el banco y borra sus enlaces. */
export async function disconnectBank(bankSessionId: string) {
  return run(async () => {
    if (!isUuid(bankSessionId)) throw new Error("Datos no válidos.");
    await getDataContext();
    const external = await bankSessionExternalId(bankSessionId);
    if (external) {
      // Si el banco ya lo había cerrado, se borra igualmente.
      await closeSession(external).catch((e) => console.error(e));
    }
    await dropBankSession(bankSessionId);
    refresh();
    return {};
  });
}
