import { Coins } from "lucide-react";
import { formatAmount, formatPercent } from "@/lib/format";
import { SectionIcon } from "./stat-card";

/**
 * «Adónde fue el dinero»: una sola barra con lo que entró en el mes, partida
 * en lo gastado y lo ahorrado (ahorro = ingresos − gastos). Si se gastó más de
 * lo que entró, la barra es lo gastado y una marca enseña dónde llegaban los
 * ingresos. Etiquetas directas debajo; el color nunca va solo.
 */
export function MoneySplit({ income, expenses, monthLabel }: { income: number; expenses: number; monthLabel: string }) {
  const savings = income - expenses;
  const base = Math.max(income, expenses);
  const over = expenses > income;
  const spentShare = income > 0 ? expenses / income : null;

  let headline: React.ReactNode;
  if (base <= 0) headline = "Aún no hay ingresos ni gastos este mes.";
  else if (income <= 0) headline = <>Este mes aún no ha entrado nada y lleváis <strong>{formatAmount(expenses)}</strong> gastados.</>;
  else if (over)
    headline = (
      <>
        Se ha gastado <strong className="text-warning">{formatAmount(expenses - income)} más</strong> de lo que entró.
      </>
    );
  else
    headline = (
      <>
        De cada 100 € que entraron, se gastaron <strong>{Math.round((spentShare ?? 0) * 100)} €</strong> y se ahorraron{" "}
        <strong>{100 - Math.round((spentShare ?? 0) * 100)} €</strong>.
      </>
    );

  const pct = (v: number) => `${base > 0 ? (v / base) * 100 : 0}%`;

  return (
    <section aria-labelledby="split-title" className="h-full rounded-card border bg-card p-4 lg:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="split-title" className="flex items-center gap-2 text-sm font-bold">
          <SectionIcon icon={Coins} tone="var(--series-savings)" />
          Adónde fue el dinero
          <span className="ml-2 text-xs font-medium text-muted-foreground">{monthLabel}</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Entró <strong className="text-foreground tabular-nums">{formatAmount(income)}</strong>
        </p>
      </div>
      <p className="mt-2 text-[15px] leading-snug lg:text-base">{headline}</p>

      {base > 0 && (
        <div className="mt-4">
          <div
            className="relative flex h-7 gap-0.5"
            role="img"
            aria-label={`Ingresos ${formatAmount(income)}; gastos ${formatAmount(expenses)}; ${
              over ? `exceso ${formatAmount(expenses - income)}` : `ahorro ${formatAmount(savings)}`
            }.`}
          >
            {expenses > 0 && (
              <div
                className="fc-grow-x h-full rounded-[6px] bg-series-expense"
                style={{ width: over ? "100%" : pct(expenses) }}
                title={`Gastos: ${formatAmount(expenses)}`}
              />
            )}
            {!over && savings > 0 && (
              <div
                className="fc-grow-x h-full flex-1 rounded-[6px] bg-series-savings"
                style={{ "--i": 4 } as React.CSSProperties}
                title={`Ahorro: ${formatAmount(savings)}`}
              />
            )}
            {over && income > 0 && (
              // Hasta dónde llegaban los ingresos; lo de la derecha es lo gastado de más.
              <div className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${pct(income)} - 1px)` }} />
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:flex sm:flex-wrap sm:gap-x-6">
            <Item color="bg-series-expense" label="Gastos" value={formatAmount(expenses)} note={spentShare !== null ? `${formatPercent(spentShare)} de lo que entró` : undefined} />
            {over ? (
              <Item color="bg-foreground" bar label="Ingresos" value={formatAmount(income)} note={`faltan ${formatAmount(expenses - income)}`} warn />
            ) : (
              <Item color="bg-series-savings" label="Ahorro" value={formatAmount(savings)} note={income > 0 ? `${formatPercent(savings / income)} de lo que entró` : undefined} />
            )}
          </dl>
        </div>
      )}
    </section>
  );
}

function Item({
  color,
  label,
  value,
  note,
  bar,
  warn,
}: {
  color: string;
  label: string;
  value: string;
  note?: string;
  bar?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 font-semibold text-muted-foreground">
        <span aria-hidden className={bar ? `h-3 w-0.5 rounded-full ${color}` : `size-2.5 rounded-[3px] ${color}`} />
        {label}
      </dt>
      <dd className="mt-0.5">
        <span className="text-base font-extrabold tabular-nums">{value}</span>
        {note && <span className={warn ? "ml-1.5 font-bold text-warning" : "ml-1.5 text-muted-foreground"}>{note}</span>}
      </dd>
    </div>
  );
}
