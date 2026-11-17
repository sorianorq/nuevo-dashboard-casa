import Link from "next/link";
import { cn } from "@/lib/utils";

export type SegmentedItem = { label: string; href: string; active: boolean };

/** Pestañas segmentadas sobre --track (subsecciones y Balances). */
export function SegmentedLinks({
  items,
  label,
  className,
}: {
  items: SegmentedItem[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex gap-1 rounded-2xl bg-track p-1">
        {items.map((item) => (
          <li key={item.href} className="min-w-0 flex-1">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              scroll={false}
              className={cn(
                "flex min-h-11 items-center justify-center truncate rounded-xl px-3 text-sm transition-colors",
                item.active
                  ? "bg-surface font-bold text-foreground shadow-sm"
                  : "font-semibold text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
