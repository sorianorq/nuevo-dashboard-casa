import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con la clave de servicio: se salta RLS. SOLO para el
 * bot de Telegram (lib/telegram/), que no tiene sesión de usuario; sus reglas
 * (quién puede escribir, en qué Balance) se comprueban en el código.
 * Nunca se usa desde pantallas ni acciones de la app.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY para el bot de Telegram.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
