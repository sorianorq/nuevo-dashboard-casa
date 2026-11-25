import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de cifra: icono en su color de serie, etiqueta, valor grande,
 * minigráfica, línea de variación y nota pequeña (acumulado). Aparece
 * escalonada (`index`) y se eleva un poco al pasar el ratón.
 */
export function StatCard({
  label,
  value,
  valueClassName,
  footer,
  note,
  spark,
  icon: Icon,
  tone,
  index = 0,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  footer?: React.ReactNode;
  /** Línea pequeña al pie (p. ej. «Acumulado 2026: …»). */
  note?: React.ReactNode;
  /** Minigráfica de 12 meses bajo la cifra. */
  spark?: React.ReactNode;
  icon?: LucideIcon;
  /** Color CSS de la serie (var(--series-…)) para el icono. */
  tone?: string;
  index?: number;
}) {
  return (
    <section
      className="fc-rise fc-lift flex min-w-0 flex-col gap-1.5 rounded-card border bg-card p-4 lg:p-5"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold text-muted-foreground">{label}</h2>
        {Icon && (
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-xl lg:size-9"
            style={{ background: `color-mix(in oklab, ${tone ?? "var(--accent)"} 14%, transparent)`, color: tone }}
          >
            <Icon className="size-4 lg:size-[18px]" strokeWidth={2.2} />
          </span>
        )}
      </div>
      <p
        className={cn(
          "truncate text-[20px] leading-tight font-extrabold tracking-tight tabular-nums lg:text-[24px]",
          valueClassName,
        )}
      >
        {value}
      </p>
      {spark && <div className="pt-1">{spark}</div>}
      {footer && <div className="min-h-4">{footer}</div>}
      {note && <p className="mt-0.5 border-t pt-1.5 text-[11px] leading-snug text-muted-foreground tabular-nums lg:truncate">{note}</p>}
    </section>
  );
}

/** Icono pequeño de cabecera de sección, en su color. */
export function SectionIcon({ icon: Icon, tone }: { icon: LucideIcon; tone?: string }) {
  return (
    <span
      aria-hidden
      className="grid size-7 shrink-0 place-items-center rounded-lg"
      style={{ background: `color-mix(in oklab, ${tone ?? "var(--accent)"} 14%, transparent)`, color: tone ?? "var(--accent)" }}
    >
      <Icon className="size-4" strokeWidth={2.2} />
    </span>
  );
}
