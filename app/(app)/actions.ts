"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data";
import { ADMIN_VIEW_COOKIE, isPerson } from "@/lib/balance";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ADMIN_VIEW_COOKIE);
  redirect("/login");
}

/**
 * Admin elige de quién ver los datos personales. Solo es una preferencia de
 * vista: se guarda si la sesión es de admin y se valida al leerla.
 */
export async function setAdminPerson(person: string) {
  const session = await getSession();
  if (session.role !== "admin" || !isPerson(person)) return;

  (await cookies()).set(ADMIN_VIEW_COOKIE, person, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
