"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAmount, formatAmountCompact } from "@/lib/format";

export type TrendPoint = {
  key: string;
  label: string; // «mar 26»
  title: string; // «Marzo 2026»
  ingresos: number;
  gastos: number;
  ahorro: number;
};

// Colores solo por tokens (estilo A). Orden fijo: ingresos, gastos, ahorro.
const SERIES = [
  { key: "ingresos", label: "Ingresos", color: "var(--positive)", kind: "bar" },
  { key: "gastos", label: "Gastos", color: "var(--accent)", kind: "bar" },
  { key: "ahorro", label: "Ahorro", color: "var(--text)", kind: "line" },
] as const;

/** Gráfico 12 meses: barras ingresos/gastos + línea de ahorro (un solo eje, €). */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground" aria-label="Leyenda">
        {SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            {s.kind === "bar" ? (
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            ) : (
              <span aria-hidden className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} />
            )}
            {s.label}
          </li>
        ))}
      </ul>
      <div className="h-[240px] lg:h-[280px]" role="img" aria-label="Ingresos, gastos y ahorro de los últimos 12 meses. Detalle en la tabla siguiente.">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickFormatter={(v: number) => formatAmountCompact(v)}
            />
            <ReferenceLine y={0} stroke="var(--muted)" strokeOpacity={0.5} />
            <Tooltip
              cursor={{ fill: "var(--track)", fillOpacity: 0.6 }}
              content={(props) => <TrendTooltip active={props.active} payload={props.payload} />}
            />
            <Bar dataKey="ingresos" name="Ingresos" fill="var(--positive)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="gastos" name="Gastos" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Line
              dataKey="ahorro"
              name="Ahorro"
              type="linear"
              stroke="var(--text)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--text)", stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: "var(--text)", stroke: "var(--surface)", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-xs">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-muted-foreground hover:text-foreground">
          Ver como tabla
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-2 text-left font-semibold">Mes</th>
                <th scope="col" className="py-2 text-right font-semibold">Ingresos</th>
                <th scope="col" className="py-2 text-right font-semibold">Gastos</th>
                <th scope="col" className="py-2 text-right font-semibold">Ahorro</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-b last:border-0">
                  <th scope="row" className="py-1.5 text-left font-medium">{d.title}</th>
                  <td className="amount py-1.5">{formatAmount(d.ingresos)}</td>
                  <td className="amount py-1.5">{formatAmount(d.gastos)}</td>
                  <td className="amount py-1.5 font-semibold">{formatAmount(d.ahorro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function TrendTooltip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as TrendPoint;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-bold">{point.title}</p>
      <dl className="space-y-0.5">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </dt>
            <dd className="font-semibold tabular-nums">{formatAmount(point[s.key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> };
