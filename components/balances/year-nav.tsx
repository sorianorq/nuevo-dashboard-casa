import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Selector de año ‹ 2026 › (hoja anual). Conserva balance y vista. */
export function YearNav({
  year,
  currentYear,
  pathname,
  params,
  className,
}: {
  year: number;
  currentYear: number;
  pathname: string;
  params: Record<string, string>;
  className?: string;
}) {
  const hrefFor = (target: number) => {
    const qs = new URLSearchParams(params);
    // Años pasados: diciembre (año completo). Año actual: el mes en curso.
    if (target >= currentYear) qs.delete("mes");
    else qs.set("mes", `${target}-12`);
    const s = qs.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const btn = "grid size-11 place-items-center rounded-xl text-foreground transition-colors hover:bg-accent";
  const canNext = year < currentYear;

  return (
    <nav aria-label="Año" className={cn("items-center justify-center gap-1 rounded-2xl border bg-surface p-1", className)}>
      <Link href={hrefFor(year - 1)} scroll={false} aria-label={`Año anterior: ${year - 1}`} className={btn}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <p className="min-w-16 text-center text-[15px] font-bold tabular-nums" aria-live="polite">
        {year}
      </p>
      {canNext ? (
        <Link href={hrefFor(year + 1)} scroll={false} aria-label={`Año siguiente: ${year + 1}`} className={btn}>
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
