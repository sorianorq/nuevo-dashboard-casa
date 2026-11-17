import { cn } from "@/lib/utils";

/** Etiqueta de sección (12 px, mayúsculas, acento) + título 28/32 px. */
export function PageHeader({
  eyebrow,
  title,
  actions,
  className,
}: {
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3 lg:mb-6", className)}>
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight lg:text-[32px]">
          {title}
        </h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
