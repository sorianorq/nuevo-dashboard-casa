import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMonth, formatMonthTitle } from "@/lib/format";
import { addMonths, compareYm, ymKey, type YearMonth } from "@/lib/months";

/** Selector de mes ‹ ›. Conserva el resto de parámetros (p. ej. balance). */
export function MonthNav({
  ym,
  maxYm,
  pathname,
  params,
  defaultYm,
}: {
  ym: YearMonth;
  maxYm: YearMonth;
  /** Mes que se ve sin «?mes=» (por defecto, maxYm). */
  defaultYm?: YearMonth;
  pathname: string;
  params: Record<string, string>;
}) {
  const prev = addMonths(ym, -1);
  const next = addMonths(ym, 1);
  const canNext = compareYm(next, maxYm) <= 0;

  const hrefFor = (target: YearMonth) => {
    const qs = new URLSearchParams(params);
    if (compareYm(target, defaultYm ?? maxYm) === 0) qs.delete("mes");
    else qs.set("mes", ymKey(target));
    const s = qs.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const btn =
    "grid size-11 place-items-center rounded-xl text-foreground transition-colors hover:bg-accent";

  return (
    <nav aria-label="Mes" className="flex items-center justify-center gap-1 rounded-2xl border bg-surface p-1">
      <Link href={hrefFor(prev)} scroll={false} aria-label={`Mes anterior: ${formatMonth(prev.year, prev.month)}`} className={btn}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <p className="min-w-[9.5rem] text-center text-[15px] font-bold" aria-live="polite">
        {formatMonthTitle(ym.year, ym.month)}
      </p>
      {canNext ? (
        <Link href={hrefFor(next)} scroll={false} aria-label={`Mes siguiente: ${formatMonth(next.year, next.month)}`} className={btn}>
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={cn(btn, "pointer-events-none text-muted-foreground opacity-40")}>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}
