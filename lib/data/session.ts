import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_VIEW_COOKIE,
  allowedOwners,
  isRole,
  parseBalanceTab,
  resolvePerson,
  type BalanceTab,
  type Owner,
  type Person,
  type Role,
} from "@/lib/balance";

export type Session = {
  userId: string;
  email: string;
  role: Role;
};

/**
 * Contexto de datos ya validado en el servidor. Todas las funciones de
 * lib/data/ lo reciben y filtran por `owner` y rol a partir de él.
 */
export type DataContext = Session & {
  /** Persona de la pestaña personal (el propio usuario, o la elegida por admin). */
  person: Person;
  tab: BalanceTab;
  /** Balance activo: casa o la persona. */
  owner: Owner;
  /** Balances que el rol puede ver. */
  allowedOwners: Owner[];
};

/**
 * Usuario y rol de la sesión. El usuario sale de Supabase Auth (validado
 * contra el servidor de Auth) y el rol de `user_roles`. Nunca de un
 * parámetro del navegador. Una vez por petición (React cache).
 */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data || !isRole(data.role)) redirect("/sin-acceso");

  return { userId: user.id, email: user.email ?? "", role: data.role };
});

/**
 * Contexto de Balance para una pantalla. `tab` viene de la URL; la persona
 * (solo admin) de una cookie de preferencia. Ambos se validan contra el rol:
 * un usuario normal siempre ve Casa o su propio Balance.
 */
export async function getDataContext(
  searchParams?: Record<string, string | string[] | undefined>,
): Promise<DataContext> {
  const session = await getSession();
  const cookieStore = await cookies();
  const person = resolvePerson(
    session.role,
    cookieStore.get(ADMIN_VIEW_COOKIE)?.value,
  );
  const tab = parseBalanceTab(first(searchParams?.balance));
  const owner: Owner = tab === "casa" ? "casa" : person;

  return {
    ...session,
    person,
    tab,
    owner,
    allowedOwners: allowedOwners(session.role),
  };
}

/** Lanza si el Balance no es visible para el rol. Úsala en cada consulta. */
export function assertOwner(ctx: Pick<DataContext, "allowedOwners">, owner: Owner) {
  if (!ctx.allowedOwners.includes(owner)) {
    throw new Error("Balance no permitido para este usuario");
  }
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
