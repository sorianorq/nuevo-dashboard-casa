import Link from "next/link";
import { ShoppingBasket } from "lucide-react";
import type { SupermarketSummary } from "@/lib/calc/summary";
import {
  formatAmount,
  formatDate,
  formatMonthShort,
  formatMonthTitle,
  formatSignedAmount,
  formatSignedPercent,
} from "@/lib/format";
import { ymKey } from "@/lib/months";
import { Delta } from "./delta";
import { Sparkline } from "./sparkline";

export function SupermarketCard({ data }: { data: SupermarketSummary }) {
  const prevNote = data.isCurrentMonth
    ? `hasta el ${formatDate(data.previousCutoff)}`
    : "mes completo";

  return (
    <section className="rounded-card border bg-card p-4 lg:p-5" aria-labelledby="super-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="super-title" className="inline-flex items-center gap-2 text-sm font-bold">
          <ShoppingBasket className="size-4 text-brand" aria-hidden />
          Supermercado
        </h2>
        <Link href="/supermercado" className="inline-flex min-h-11 items-center text-xs font-semibold text-brand hover:underline">
          Ver
        </Link>
      </div>
      <p className="text-[24px] leading-tight font-extrabold tracking-tight tabular-nums">
        {formatAmount(data.spent)}
      </p>
      {data.isCurrentMonth && <p className="text-xs text-muted-foreground">Del día 1 a hoy</p>}

      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">
            vs mes anterior
            <span className="block text-[11px]">{prevNote}</span>
          </dt>
          <dd className="text-right">
            <Delta
              value={data.vsPrevious}
              text={data.vsPrevious === null ? "" : formatSignedPercent(data.vsPrevious)}
              goodWhenUp={false}
            />
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">
            vs media 12 meses
            <span className="block text-[11px]">
              {data.reference === null
                ? "sin historial"
                : `${data.isCurrentMonth ? "proporcional: " : "media: "}${formatAmount(data.reference)}${
                    data.monthsInAverage < 12 ? ` · ${data.monthsInAverage} meses` : ""
                  }`}
            </span>
          </dt>
          <dd className="flex flex-col items-end">
            <Delta
              value={data.deviation}
              text={data.deviation === null ? "" : formatSignedAmount(data.deviation)}
              goodWhenUp={false}
            />
            {data.deviationRatio !== null && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {formatSignedPercent(data.deviationRatio)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <Sparkline
          label="Gasto en supermercado de los últimos 12 meses"
          data={data.spark.map((s) => ({
            key: ymKey(s.ym),
            title: formatMonthTitle(s.ym.year, s.ym.month),
            total: s.total,
          }))}
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>{formatMonthShort(data.spark[0].ym.year, data.spark[0].ym.month)}</span>
          <span>{formatMonthShort(data.spark[11].ym.year, data.spark[11].ym.month)}</span>
        </div>
      </div>
    </section>
  );
}
