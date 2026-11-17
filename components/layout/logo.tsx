import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-xl bg-brand text-[15px] font-extrabold text-primary-foreground"
      >
        FC
      </span>
      {!compact && (
        <span className="text-[17px] leading-tight font-extrabold tracking-tight">
          Finanzas Casa
        </span>
      )}
    </span>
  );
}
