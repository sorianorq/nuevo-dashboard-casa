"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatAmount } from "@/lib/format";

export type SparkPoint = { key: string; title: string; total: number };

/** Minigráfica de 12 meses (una serie). El mes elegido, en acento pleno. */
export function Sparkline({ data, label }: { data: SparkPoint[]; label: string }) {
  const lastKey = data[data.length - 1]?.key;
  return (
    <div className="h-14" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
          <Tooltip
            cursor={{ fill: "var(--track)", fillOpacity: 0.6 }}
            content={(props) => <SparkTooltip active={props.active} payload={props.payload} />}
          />
          <Bar dataKey="total" radius={[3, 3, 0, 0]} minPointSize={2}>
            {data.map((d) => (
              <Cell key={d.key} fill="var(--accent)" fillOpacity={d.key === lastKey ? 1 : 0.35} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SparkTooltip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as SparkPoint;
  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <span className="font-bold">{p.title}</span>{" "}
      <span className="tabular-nums">{formatAmount(p.total)}</span>
    </div>
  );
}

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> };
