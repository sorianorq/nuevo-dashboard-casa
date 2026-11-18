import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Cliente de Supabase para el servidor (Server Components, Server Actions,
 * Route Handlers). Usa la clave anon y la sesión del usuario guardada en
 * cookies: todo acceso a datos pasa por RLS con la identidad real.
 */
export async function createClient() {
  const cookieStore = await cookies();
  // Datos de cada usuario: nunca se prerenderizan. Además supabase-js usa
  // la hora actual (caducidad del token), que con Cache Components solo
  // puede leerse en tiempo de petición.
  await connection();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies.
            // El proxy ya refresca la sesión en cada petición.
          }
        },
      },
    },
  );
}
