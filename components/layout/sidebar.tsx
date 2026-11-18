"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "@/lib/nav";
import { Logo } from "./logo";
import { NavIcon } from "./nav-icon";
import { useQuickAdd } from "./quick-add";

/** Menú lateral fijo del ordenador (≈260 px, desde `lg`). */
export function Sidebar({ user }: { user: React.ReactNode }) {
  const pathname = usePathname();
  const quickAdd = useQuickAdd();
  // Abierta por defecto la sección actual; el usuario puede abrir varias.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  return (
    <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r bg-sidebar lg:flex">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between gap-2">
          <Link href="/resumen" aria-label="Finanzas Casa · Resumen" className="rounded-lg">
            <Logo />
          </Link>
          <SidebarToggle mode="close" />
        </div>
        <Button className="mt-5 w-full" onClick={quickAdd.open}>
          <Plus aria-hidden />
          Añadir gasto
        </Button>
      </div>

      <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {NAV.map((section) => {
            const current = isActive(pathname, section.match);

            if (!section.children) {
              return (
                <li key={section.id}>
                  <Link
                    href={section.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-bold transition-colors",
                      current
                        ? "bg-brand text-primary-foreground"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    <NavIcon name={section.icon} className="size-5" />
                    {section.label}
                  </Link>
                </li>
              );
            }

            const open = toggled[section.id] ?? current;
            const listId = `nav-${section.id}`;

            return (
              <li key={section.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => setToggled((t) => ({ ...t, [section.id]: !open }))}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-bold transition-colors hover:bg-accent",
                    current ? "text-brand" : "text-foreground",
                  )}
                >
                  <NavIcon name={section.icon} className="size-5" />
                  <span className="flex-1">{section.label}</span>
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>
                <ul
                  id={listId}
                  hidden={!open}
                  className="mt-1 ml-[22px] space-y-0.5 border-l-2 border-track pl-3"
                >
                  {section.children.map((child) => {
                    const childActive = isActive(pathname, child.href);
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          aria-current={childActive ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors",
                            childActive
                              ? "bg-brand-soft font-bold text-foreground"
                              : "font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          {child.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">{user}</div>
          <Link
            href="/ajustes"
            aria-label="Ajustes"
            aria-current={isActive(pathname, "/ajustes") ? "page" : undefined}
            className={cn(
              "grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              isActive(pathname, "/ajustes") && "bg-brand-soft text-foreground",
            )}
          >
            <Settings className="size-5" aria-hidden />
          </Link>
        </div>
      </div>
    </aside>
  );
}

/**
 * Ocultar / mostrar el menú lateral (ordenador). Se guarda en este navegador
 * y se aplica con un atributo en <html> (sin parpadeo al cargar).
 */
export function SidebarToggle({ mode }: { mode: "open" | "close" }) {
  const set = (closed: boolean) => {
    if (closed) document.documentElement.dataset.sidebar = "closed";
    else delete document.documentElement.dataset.sidebar;
    try {
      if (closed) localStorage.setItem("fc-sidebar", "closed");
      else localStorage.removeItem("fc-sidebar");
    } catch {
      // Sin almacenamiento (modo privado): vale para esta visita.
    }
  };
  if (mode === "close") {
    return (
      <button
        type="button"
        onClick={() => set(true)}
        aria-label="Ocultar el menú lateral"
        title="Ocultar menú"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <PanelLeftClose className="size-5" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => set(false)}
      aria-label="Mostrar el menú lateral"
      title="Mostrar menú"
      className="sidebar-open-button fixed top-4 left-3 z-40 size-10 place-items-center rounded-xl border bg-surface text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
    >
      <PanelLeftOpen className="size-5" aria-hidden />
    </button>
  );
}
