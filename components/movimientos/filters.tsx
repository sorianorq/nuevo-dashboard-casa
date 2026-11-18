"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_LABEL, SECTION_ORDER, type Account, type ConceptOption } from "@/lib/labels";

const selectClass =
  "h-11 w-full min-w-0 rounded-xl border bg-surface px-3 text-sm text-foreground hover:bg-accent";

/** Buscador y filtros de Movimientos. Viven en la URL (se pueden compartir). */
export function MovementFilters({
  accounts,
  concepts,
}: {
  accounts: Account[];
  concepts: ConceptOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  // Búsqueda con espera breve para no recargar en cada tecla.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => update({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["q", "cuenta", "concepto", "tipo"].some((k) => params.get(k));

  return (
    <div className={cn("space-y-2", pending && "opacity-70")} aria-busy={pending}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en la descripción"
          aria-label="Buscar en la descripción"
          className="h-11 w-full rounded-xl border bg-surface pr-3 pl-9 text-base md:text-sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          aria-label="Cuenta"
          className={selectClass}
          value={params.get("cuenta") ?? ""}
          onChange={(e) => update({ cuenta: e.target.value || null })}
        >
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Concepto"
          className={selectClass}
          value={params.get("concepto") ?? ""}
          onChange={(e) => update({ concepto: e.target.value || null })}
        >
          <option value="">Todos los conceptos</option>
          <option value="sin">Sin concepto</option>
          {SECTION_ORDER.map((s) => (
            <optgroup key={s} label={SECTION_LABEL[s]}>
              {concepts
                .filter((c) => c.section === s)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select
          aria-label="Tipo"
          className={selectClass}
          value={params.get("tipo") ?? ""}
          onChange={(e) => update({ tipo: e.target.value || null })}
        >
          <option value="">Todos los tipos</option>
          <option value="ingreso">Ingresos</option>
          <option value="gasto">Gastos</option>
          <option value="no-cuenta">No cuentan (traspasos y liquidaciones)</option>
        </select>
      </div>
      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            update({ q: null, cuenta: null, concepto: null, tipo: null });
          }}
          className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          <X className="size-3.5" aria-hidden />
          Quitar filtros
        </button>
      )}
    </div>
  );
}
