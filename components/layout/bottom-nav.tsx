"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, isActive, type NavSection } from "@/lib/nav";
import { NavIcon } from "./nav-icon";
import { useQuickAdd } from "./quick-add";

/** Barra inferior del móvil: Resumen · Contabilidad · ➕ · Súper · Movimientos. */
export function BottomNav() {
  const pathname = usePathname();
  const quickAdd = useQuickAdd();
  const [resumen, contabilidad, supermercado, movimientos] = NAV;

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 items-end px-1">
        <Item section={resumen} pathname={pathname} />
        <Item section={contabilidad} pathname={pathname} />
        <li className="flex justify-center">
          <button
            type="button"
            onClick={quickAdd.open}
            aria-label="Añadir gasto"
            className="-mt-4 mb-2 grid size-14 place-items-center rounded-full bg-brand text-primary-foreground shadow-md ring-4 ring-background transition-transform active:scale-95"
          >
            <Plus className="size-6" aria-hidden />
          </button>
        </li>
        <Item section={supermercado} pathname={pathname} />
        <Item section={movimientos} pathname={pathname} />
      </ul>
    </nav>
  );
}

function Item({ section, pathname }: { section: NavSection; pathname: string }) {
  const active = isActive(pathname, section.match);
  return (
    <li>
      <Link
        href={section.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors",
          active ? "font-bold text-brand" : "font-semibold text-muted-foreground",
        )}
      >
        <NavIcon name={section.icon} className="size-6" strokeWidth={active ? 2.4 : 2} />
        {section.shortLabel}
      </Link>
    </li>
  );
}
