import Link from "next/link";
import { Settings } from "lucide-react";
import { Logo } from "./logo";

/** Cabecera del móvil: logo y acceso a Ajustes (en ordenador están en el menú). */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/resumen" aria-label="Finanzas Casa · Resumen" className="rounded-lg">
          <Logo className="[&>span:last-child]:text-[15px]" />
        </Link>
        <Link
          href="/ajustes"
          aria-label="Ajustes"
          className="-mr-2 grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings className="size-5" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
