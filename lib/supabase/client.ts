import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de navegador. Solo para autenticación (iniciar sesión).
 * Las consultas de datos NO se hacen desde el navegador: van por lib/data/
 * en el servidor.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
