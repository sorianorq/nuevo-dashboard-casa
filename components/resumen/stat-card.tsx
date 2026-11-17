import { cn } from "@/lib/utils";

/** Tarjeta de cifra: etiqueta, valor grande y línea de variación. */
export function StatCard({
  label,
  value,
  valueClassName,
  footer,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  footer?: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5 rounded-card border bg-card p-4 lg:p-5">
      <h2 className="text-xs font-bold text-muted-foreground">{label}</h2>
      <p
        className={cn(
          "truncate text-[20px] leading-tight font-extrabold tracking-tight tabular-nums lg:text-[24px]",
          valueClassName,
        )}
      >
        {value}
      </p>
      {footer && <div className="min-h-4">{footer}</div>}
    </section>
  );
}
