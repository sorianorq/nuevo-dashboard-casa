"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatAmount, formatDate, formatDayHeading, formatPercent } from "@/lib/format";
import { OWNER_LABEL } from "@/lib/balance";
import { conceptLabel, type Payment } from "@/lib/calc/pagos";
import type { PersonalData } from "@/lib/data/pagos";
import { PaymentForm, type PaymentFormProps } from "./payment-form";

type Shared = Omit<PaymentFormProps, "payment" | "onDone" | "onCancel" | "idPrefix" | "mode" | "methods">;

type Props = Shared & {
  data: Omit<PersonalData, "concepts" | "conceptsComplete" | "history">;
  monthLabel: string;
  monthNav: React.ReactNode;
};

const AMEX = "__amex";
const NO_CONCEPT = "__none";

/** Pagos de una persona: gastado frente a presupuesto, por concepto y lista. */
export function PersonalView({ data, monthLabel, monthNav, ...shared }: Props) {
  const [editing, setEditing] = useState<{ payment: Payment | null; key: number } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const methodName = useMemo(() => new Map(data.methods.map((m) => [m.id, m.name])), [data.methods]);

  const means = (p: Payment) => (p.wallet === "amex" ? "Amex" : ((p.paymentMethodId && methodName.get(p.paymentMethodId)) ?? "Sin medio de pago"));
  const describe = (p: Payment) => conceptLabel(p.conceptId ? data.refs[p.conceptId] : undefined, p.paidBy);
  const open = (p: Payment | null) => setEditing({ payment: p, key: Date.now() });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 lg:mb-6">
        {monthNav}
        <Button onClick={() => open(null)} className="h-11 rounded-xl px-4 lg:hidden">
          <Plus aria-hidden /> Nuevo gasto
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-5">
        <section aria-labelledby="new-title" className="hidden rounded-card border bg-card p-5 lg:block">
          <h2 id="new-title" className="mb-4 text-[17px] font-bold">
            Nuevo gasto
          </h2>
          <PaymentForm
            key={formKey}
            {...shared}
            mode="personal"
            methods={data.methods}
            payment={null}
            idPrefix="desk"
            onDone={() => setFormKey((k) => k + 1)}
          />
        </section>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <BudgetCard data={data} monthLabel={monthLabel} />
          <ConceptBars data={data} />
          <List rows={data.month} methods={data.methods} means={means} describe={describe} onOpen={open} />
        </div>
      </div>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing.payment ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
              <DialogDescription>Pagos de {OWNER_LABEL[data.person]} · cuenta en el Balance que elijas.</DialogDescription>
            </DialogHeader>
            <PaymentForm
              key={editing.key}
              {...shared}
              mode="personal"
              methods={data.methods}
              payment={editing.payment}
              idPrefix="dlg"
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function BudgetCard({ data, monthLabel }: { data: Props["data"]; monthLabel: string }) {
  const ratio = data.budget ? data.spentBudgeted / data.budget : null;
  const left = data.budget !== null ? data.budget - data.spentBudgeted : null;
  return (
    <section aria-label={`Gastado en ${monthLabel}`} className="rounded-card border bg-card p-4 lg:p-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] text-muted-foreground">Gastado en el mes</h2>
          <p className="truncate text-2xl font-extrabold tabular-nums">{formatAmount(data.spent)}</p>
        </div>
        <div className="min-w-0 border-l pl-3">
          <h2 className="text-[13px] text-muted-foreground">Presupuesto</h2>
          <p className="truncate text-2xl font-extrabold tabular-nums">{data.budget === null ? "—" : formatAmount(data.budget)}</p>
        </div>
      </div>
      {ratio !== null && left !== null ? (
        <>
          <div
            role="meter"
            aria-label="Presupuesto usado"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-track"
          >
            <div className={cn("h-full rounded-full", ratio >= 0.9 ? "bg-warning" : "bg-brand")} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
          </div>
          <p className={cn("mt-1.5 text-xs", left < 0 ? "font-semibold text-warning" : "text-muted-foreground")}>
            {formatPercent(ratio)} · {left < 0 ? `▲ te pasas en ${formatAmount(-left)}` : `quedan ${formatAmount(left)}`}
            {data.spentBudgeted !== data.spent && ` · ${formatAmount(data.spentBudgeted)} en conceptos con presupuesto`}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Sin presupuesto este mes (se define en Presupuesto).</p>
      )}
    </section>
  );
}

function ConceptBars({ data }: { data: Props["data"] }) {
  if (!data.byConcept.length) return null;
  const max = Math.max(...data.byConcept.map((c) => Math.max(c.amount, c.budget ?? 0)), 0.01);
  return (
    <section aria-labelledby="concepts-title" className="rounded-card border bg-card p-4 lg:p-5">
      <h2 id="concepts-title" className="mb-3 text-base font-bold">
        Por concepto
      </h2>
      <ul className="space-y-3">
        {data.byConcept.map((c) => {
          const name = c.conceptId ? conceptLabel(data.refs[c.conceptId], data.person) : "Sin concepto";
          const over = c.budget !== null && c.amount > c.budget;
          const near = c.budget !== null && c.budget > 0 && c.amount / c.budget >= 0.9;
          return (
            <li key={c.key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-2.5 text-sm">
              <span className={cn("truncate font-semibold", !c.conceptId && "text-warning")}>{name}</span>
              <span className="relative h-2 overflow-hidden rounded-full bg-track" aria-hidden>
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", near ? "bg-warning" : "bg-brand")}
                  style={{ width: `${(c.amount / max) * 100}%` }}
                />
              </span>
              <span className="text-right text-muted-foreground tabular-nums">
                <strong className={cn("text-foreground", over && "text-warning")}>{formatAmount(c.amount)}</strong>
                {c.budget !== null && <> / {formatAmount(c.budget)}</>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function List({
  rows,
  methods,
  means,
  describe,
  onOpen,
}: {
  rows: Payment[];
  methods: PersonalData["methods"];
  means: (p: Payment) => string;
  describe: (p: Payment) => string;
  onOpen: (p: Payment) => void;
}) {
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");
  const [concept, setConcept] = useState("");

  const methodKey = (p: Payment) => (p.wallet === "amex" ? AMEX : (p.paymentMethodId ?? ""));
  const conceptKey = (p: Payment) => p.conceptId ?? NO_CONCEPT;
  const conceptOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of rows) m.set(conceptKey(p), describe(p));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [rows, describe]);

  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (p) =>
      (!q || p.description.toLowerCase().includes(q) || (p.comment ?? "").toLowerCase().includes(q)) &&
      (!method || methodKey(p) === method) &&
      (!concept || conceptKey(p) === concept),
  );
  const total = Math.round(shown.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const days = new Map<string, Payment[]>();
  for (const p of shown) days.set(p.date, [...(days.get(p.date) ?? []), p]);
  const select = "h-11 min-w-0 rounded-xl border bg-surface px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <section aria-labelledby="list-title" className="space-y-3">
      <h2 id="list-title" className="sr-only">
        Gastos del mes
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <label className="col-span-2 flex h-11 min-w-0 items-center gap-2 rounded-xl border bg-surface px-3 text-muted-foreground sm:flex-[1_1_12rem]">
          <Search className="size-4 shrink-0" aria-hidden />
          <Input
            type="search"
            placeholder="Buscar"
            aria-label="Buscar gastos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 min-w-0 border-0 bg-transparent px-0 text-foreground shadow-none focus-visible:ring-0"
          />
        </label>
        <select aria-label="Medio de pago" value={method} onChange={(e) => setMethod(e.target.value)} className={cn(select, "sm:max-w-56")}>
          <option value="">Medio de pago: todos</option>
          <option value={AMEX}>Amex</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select aria-label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} className={cn(select, "sm:max-w-56")}>
          <option value="">Concepto: todos</option>
          {conceptOptions.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {shown.length === 1 ? "1 gasto" : `${shown.length} gastos`} · {formatAmount(total)}
        {shown.length !== rows.length && " (con filtros)"}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-card border bg-card p-4 text-sm text-muted-foreground">
          {rows.length ? "Ningún gasto con estos filtros." : "Sin pagos este mes."}
        </p>
      ) : (
        <>
          <div className="rounded-card border bg-card px-4 pt-1 pb-2 lg:hidden">
            {[...days].map(([day, list]) => (
              <div key={day}>
                <h3 className="pt-3 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{formatDayHeading(day)}</h3>
                <ul>
                  {list.map((p) => (
                    <li key={p.id} className="border-b last:border-b-0">
                      <button type="button" onClick={() => onOpen(p)} className="flex min-h-14 w-full items-center gap-3 py-1.5 text-left hover:bg-accent">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{p.description || "Sin descripción"}</span>
                          <span className={cn("block truncate text-xs", p.conceptId ? "text-muted-foreground" : "text-warning")}>
                            {means(p)} · {describe(p)}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className="text-[15px] font-bold tabular-nums">{formatAmount(p.amount)}</span>
                          {p.pending && <span className="text-[11px] font-bold text-warning">PENDIENTE</span>}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-card border bg-card lg:block">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="border-b px-3.5 py-3">Fecha</th>
                  <th scope="col" className="border-b px-3.5 py-3">Descripción</th>
                  <th scope="col" className="border-b px-3.5 py-3">Medio de pago</th>
                  <th scope="col" className="border-b px-3.5 py-3">Concepto</th>
                  <th scope="col" className="border-b px-3.5 py-3 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} onClick={() => onOpen(p)} className="cursor-pointer hover:bg-accent">
                    <td className="border-b px-3.5 py-2.5 text-muted-foreground tabular-nums">{formatDate(p.date).slice(0, 5)}</td>
                    <td className="max-w-64 border-b px-3.5 py-2.5 font-semibold">
                      <button type="button" onClick={(e) => (e.stopPropagation(), onOpen(p))} className="block max-w-full truncate text-left hover:underline">
                        {p.description || "Sin descripción"}
                      </button>
                    </td>
                    <td className="border-b px-3.5 py-2.5">
                      {means(p)}
                      {p.pending && <span className="ml-2 text-[11px] font-bold text-warning">PENDIENTE</span>}
                    </td>
                    <td className={cn("border-b px-3.5 py-2.5", p.conceptId ? "text-muted-foreground" : "text-warning")}>{describe(p)}</td>
                    <td className="border-b px-3.5 py-2.5 text-right font-bold tabular-nums">{formatAmount(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
