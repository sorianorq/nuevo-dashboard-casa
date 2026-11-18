import { BottomNav } from "./bottom-nav";
import { MobileHeader } from "./mobile-header";
import { QuickAddProvider } from "./quick-add";
import { Sidebar, SidebarToggle } from "./sidebar";

/**
 * Layout responsive: menú lateral desde `lg`, barra inferior por debajo.
 */
export function AppShell({
  user,
  children,
}: {
  /** Bloque de usuario del menú lateral (lee la sesión: va en Suspense). */
  user: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <QuickAddProvider>
      <Sidebar user={user} />
      <SidebarToggle mode="open" />
      <MobileHeader />
      <div className="sidebar-offset lg:pl-[260px]">
        <main
          id="contenido"
          className="mx-auto w-full max-w-[1240px] has-[[data-wide]]:max-w-[1840px] px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-12"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </QuickAddProvider>
  );
}
