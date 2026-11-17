import { cn } from "@/lib/utils";

export type DeltaTone = "positive" | "warning" | "neutral";

/**
 * Variación con flecha ▲/▼ y texto: el color nunca es la única señal.
 * `goodWhenUp`: si subir es bueno (ingresos, ahorro) o malo (gastos).
 */
export function Delta({
  value,
  text,
  goodWhenUp,
  suffix,
  className,
}: {
  /** Signo de la variación (solo se usa su signo). */
  value: number | null;
  text: string;
  goodWhenUp: boolean;
  suffix?: string;
  className?: string;
}) {
  if (value === null) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Sin comparación</span>;
  }
  const flat = Math.abs(value) < 1e-9;
  const up = value > 0;
  const tone: DeltaTone = flat ? "neutral" : up === goodWhenUp ? "positive" : "warning";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-bold tabular-nums",
        tone === "positive" && "text-positive",
        tone === "warning" && "text-warning",
        tone === "neutral" && "text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden>{flat ? "=" : up ? "▲" : "▼"}</span>
      <span>{text}</span>
      {suffix && <span className="font-medium text-muted-foreground">{suffix}</span>}
    </span>
  );
}
