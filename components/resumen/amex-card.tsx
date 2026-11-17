import Link from "next/link";
import { CreditCard } from "lucide-react";
import { formatAmount } from "@/lib/format";

/** Amex en 2 columnas: gastado en el mes | pendiente de traspaso (todas las fechas). */
export function AmexCard({ monthSpent, pending }: { monthSpent: number; pending: number }) {
  return (
    <section className="rounded-card border bg-card p-4 lg:p-5" aria-labelledby="amex-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="amex-title" className="inline-flex items-center gap-2 text-sm font-bold">
          <CreditCard className="size-4 text-brand" aria-hidden />
          American Express
        </h2>
        <Link href="/pagos/amex" className="inline-flex min-h-11 items-center text-xs font-semibold text-brand hover:underline">
          Ver
        </Link>
      </div>
      <dl className="grid grid-cols-2 divide-x">
        <div className="pr-3">
          <dt className="text-xs text-muted-foreground">Gastado en el mes</dt>
          <dd className="mt-1 text-[18px] font-extrabold tabular-nums">{formatAmount(monthSpent)}</dd>
        </div>
        <div className="pl-3">
          <dt className="text-xs text-muted-foreground">Pendiente de traspaso</dt>
          <dd className="mt-1 text-[18px] font-extrabold tabular-nums">{formatAmount(pending)}</dd>
        </div>
      </dl>
    </section>
  );
}
