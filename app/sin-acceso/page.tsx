import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(app)/actions";

export const metadata: Metadata = { title: "Sin acceso" };

/**
 * Sesión iniciada pero sin rol en user_roles. No se consulta ningún dato.
 */
export default function NoAccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-card border bg-card p-6 sm:p-8">
          <h1 className="text-[22px] font-extrabold tracking-tight">Sin acceso</h1>
          <p className="mt-2 text-muted-foreground">
            Tu usuario no tiene un rol asignado. Pide a Ricardo que lo revise.
          </p>
          <form action={signOut} className="mt-6">
            <Button type="submit" variant="outline" className="w-full">
              Cerrar sesión
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
