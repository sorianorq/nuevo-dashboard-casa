import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de cifra: etiqueta con su icono (en el color de la serie), valor
 * grande, minigráfica, línea de variación y nota pequeña (acumulado).
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
}) {
  return (
    <section className={"fc-float flex min-w-0 flex-col gap-1.5 p-4 lg:p-5"}>
      <h2 className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        {Icon && <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.2} style={{ color: tone }} />}
        {label}
      </h2>
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

/** Icono de cabecera de sección, en su color (sin recuadro). */
export function SectionIcon({ icon: Icon, tone }: { icon: LucideIcon; tone?: string }) {
  return <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.2} style={{ color: tone ?? "var(--accent)" }} />;
}
