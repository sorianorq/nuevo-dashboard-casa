"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { formatMonthTitle } from "@/lib/format";
import { addMonths, compareYm, parseYm, ymKey, type YearMonth } from "@/lib/months";

/**
 * Selector de mes en desplegable (del más reciente al más antiguo, agrupado
 * por año). Conserva el resto de parámetros; el mes por defecto (maxYm o
 * defaultYm) se ve sin «?mes=».
 */
export function MonthSelect({
  ym,
  minYm,
  maxYm,
  defaultYm,
  pathname,
  params,
}: {
  ym: YearMonth;
  minYm: YearMonth;
  maxYm: YearMonth;
  defaultYm?: YearMonth;
  pathname: string;
  params: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Meses de maxYm hacia atrás hasta minYm (y siempre el seleccionado).
  const lower = compareYm(ym, minYm) < 0 ? ym : minYm;
  const months: YearMonth[] = [];
  for (let m = maxYm; compareYm(m, lower) >= 0; m = addMonths(m, -1)) months.push(m);
  const years = [...new Set(months.map((m) => m.year))];

  const go = (value: string) => {
    const target = parseYm(value);
    if (!target) return;
    const qs = new URLSearchParams(params);
    if (compareYm(target, defaultYm ?? maxYm) === 0) qs.delete("mes");
    else qs.set("mes", ymKey(target));
    const s = qs.toString();
    startTransition(() => router.push(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  return (
    <div className="relative">
      <select
        aria-label="Mes"
        value={ymKey(ym)}
        onChange={(e) => go(e.target.value)}
        className="h-12 min-w-[12rem] cursor-pointer appearance-none rounded-2xl border bg-surface pr-11 pl-4 text-[15px] font-bold text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        {years.map((year) => (
          <optgroup key={year} label={String(year)}>
            {months
              .filter((m) => m.year === year)
              .map((m) => (
                <option key={ymKey(m)} value={ymKey(m)}>
                  {formatMonthTitle(m.year, m.month)}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
      </span>
    </div>
  );
}
