import { cn } from "@/lib/utils";

/** Botón de opción en forma de píldora (aria-pressed), ≥ 44 px de alto. */
export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-3.5 text-sm font-semibold transition-colors",
        active ? "border-foreground bg-foreground text-background" : "bg-surface hover:bg-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}
