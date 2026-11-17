import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SidebarUser, SidebarUserFallback } from "@/components/layout/sidebar-user";

/**
 * Carcasa de la app (estática). La sesión se valida en el servidor dentro de
 * cada página y del bloque de usuario, siempre tras <Suspense> (Cache
 * Components). El proxy además manda a /login si no hay sesión.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      user={
        <Suspense fallback={<SidebarUserFallback />}>
          <SidebarUser />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
