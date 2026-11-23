"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatAmount, formatDate, formatDayHeading } from "@/lib/format";
import { todayIso } from "@/lib/months";
import { amexPayer, type Payment } from "@/lib/calc/pagos";
import { OWNER_LABEL, type Owner } from "@/lib/balance";
import type { AmexData } from "@/lib/data/pagos";
import { markTransferredAction } from "@/app/(app)/movimientos/pagos-actions";
import { PaymentForm, type PaymentFormProps } from "./payment-form";

type Shared = Omit<PaymentFormProps, "payment" | "onDone" | "onCancel" | "idPrefix">;

type Props = Shared & {
  data: Omit<AmexData, "concepts" | "conceptsComplete" | "history">;
  /** Mes en pantalla, para el título del formulario. */
  monthLabel: string;
  /** Selector de mes (servidor). */
  monthNav: React.ReactNode;
};

const NO_CONCEPT = "__none";
const SUPER = "__super";

/** Pagos · American Express (compartida). */
export function AmexView({ data, monthLabel, monthNav, ...shared }: Props) {
  const [editing, setEditing] = useState<{ payment: Payment | null; key: number } | null>(null);
  const [formKey, setFormKey] = useState(0);

  const describe = (p: Payment) =>
    p.purchaseId && !p.conceptId ? "Supermercado" : ((p.conceptId && data.refs[p.conceptId]?.name) || "Sin concepto");
  // «Quién lo paga»: Ricardo / Andrea (traspasan) o Casa (sin traspaso).
  const balance = (p: Payment) => OWNER_LABEL[amexPayer(p)];
  useLiveRefresh();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 lg:mb-6">
        {monthNav}
        <Button onClick={() => setEditing({ payment: null, key: Date.now() })} className="h-11 rounded-xl px-4 lg:hidden">
          <Plus aria-hidden /> Nuevo gasto
        </Button>
      </div>

      {/* Móvil: datos clave, pendientes, lista. Ordenador: alta + pendientes a la izquierda. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <section aria-labelledby="new-title" className="hidden rounded-card border bg-card p-5 lg:block">
            <h2 id="new-title" className="mb-4 text-[17px] font-bold">
              Nuevo gasto
            </h2>
            <PaymentForm
              key={formKey}
              {...shared}
              payment={null}
              idPrefix="desk"
              onDone={() => setFormKey((k) => k + 1)}
            />
          </section>
          <PendingCard
            pending={data.pending}
            total={data.pendingTotal}
            describe={describe}
            balance={balance}
            onOpen={(p) => setEditing({ payment: p, key: Date.now() })}
          />
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <Kpis data={data} monthLabel={monthLabel} />
          <CycleCard cycle={data.cycle} />
          <ExpenseList
            rows={data.month}
            describe={describe}
            balance={balance}
            onOpen={(p) => setEditing({ payment: p, key: Date.now() })}
          />
        </div>
      </div>

      {editing && (
        <EditDialog
          key={editing.key}
          payment={editing.payment}
          shared={shared}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Kpis({ data, monthLabel }: { data: Props["data"]; monthLabel: string }) {
  const owners: Owner[] = ["casa", "ricardo", "andrea"];
  return (
    <section aria-label={`Datos clave de ${monthLabel}`} className="order-1 rounded-card border bg-card p-4 lg:order-none lg:p-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] text-muted-foreground">Gastado en el mes</h2>
          <p className="truncate text-2xl font-extrabold tabular-nums">{formatAmount(data.spent)}</p>
        </div>
        <div className="min-w-0 border-l pl-3">
          <h2 className="text-[13px] text-muted-foreground">Pendiente de traspaso</h2>
          <p className="truncate text-2xl font-extrabold text-brand tabular-nums">{formatAmount(data.pendingTotal)}</p>
        </div>
      </div>
      <ul className="mt-3.5 grid grid-cols-3 gap-2">
        {owners.map((o) => (
          <li key={o} className="min-w-0 rounded-[10px] bg-brand-soft px-2.5 py-2">
            <span className="block text-xs text-muted-foreground">{o === "casa" ? "Casa (sin traspaso)" : OWNER_LABEL[o]}</span>
            <span className="block truncate text-sm font-bold tabular-nums">{formatAmount(data.byPayer[o])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PendingCard({
  pending,
  total,
  describe,
  balance,
  onOpen,
}: {
  pending: Payment[];
  total: number;
  describe: (p: Payment) => string;
  balance: (p: Payment) => string;
  onOpen: (p: Payment) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, start] = useTransition();
  const chosen = pending.filter((p) => selected.has(p.id));
  const chosenTotal = Math.round(chosen.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const all = pending.length > 0 && chosen.length === pending.length;

  const mark = () =>
    start(async () => {
      const res = await markTransferredAction(chosen.map((p) => p.id));
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success(res.count === 1 ? "1 gasto marcado como traspasado" : `${res.count} gastos marcados como traspasados`);
        setSelected(new Set());
      });
    });

  return (
    <section aria-labelledby="pending-title" className="order-2 rounded-card border bg-card p-4 lg:order-none lg:p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 id="pending-title" className="text-base font-bold lg:text-[17px]">
          Pendiente de traspaso
          <span className="block text-sm font-semibold text-muted-foreground tabular-nums">
            {pending.length === 1 ? "1 gasto" : `${pending.length} gastos`} · {formatAmount(total)}
          </span>
        </h2>
        {pending.length > 1 && (
          <button
            type="button"
            onClick={() => setSelected(all ? new Set() : new Set(pending.map((p) => p.id)))}
            className="min-h-11 shrink-0 px-1 text-xs font-bold text-brand"
          >
            {all ? "Quitar todos" : "Elegir todos"}
          </button>
        )}
      </div>
      {pending.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No hay nada pendiente.</p>
      ) : (
        <ul>
          {pending.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b last:border-b-0">
              <input
                type="checkbox"
                aria-label={`Elegir ${p.description} de ${formatDate(p.date)}, ${formatAmount(p.amount)}`}
                checked={selected.has(p.id)}
                onChange={(e) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    return next;
                  })
                }
                className="size-5 shrink-0 accent-brand"
              />
              <button
                type="button"
                onClick={() => onOpen(p)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1.5 text-left hover:bg-accent"
              >
                <span className="w-11 shrink-0 text-[13px] text-muted-foreground tabular-nums">{formatDate(p.date).slice(0, 5)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.description || "Sin descripción"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {balance(p)} · {describe(p)}
                  </span>
                </span>
                <span className="text-[15px] font-bold tabular-nums">{formatAmount(p.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <Button variant="outline" disabled={!chosen.length || busy} onClick={mark} className="mt-3 h-11 w-full">
          {busy
            ? "Guardando…"
            : chosen.length
              ? `Marcar como traspasados (${chosen.length} · ${formatAmount(chosenTotal)})`
              : "Marcar como traspasados"}
        </Button>
      )}
    </section>
  );
}

function ExpenseList({
  rows,
  describe,
  balance,
  onOpen,
}: {
  rows: Payment[];
  describe: (p: Payment) => string;
  balance: (p: Payment) => string;
  onOpen: (p: Payment) => void;
}) {
  const [query, setQuery] = useState("");
  const [who, setWho] = useState<Owner | "">("");
  const [concept, setConcept] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);

  const keyOf = (p: Payment) => (p.purchaseId && !p.conceptId ? SUPER : (p.conceptId ?? NO_CONCEPT));
  const conceptOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of rows) m.set(keyOf(p), keyOf(p) === NO_CONCEPT ? "Sin concepto" : describe(p));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [rows, describe]);

  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (p) =>
      (!q || p.description.toLowerCase().includes(q) || (p.comment ?? "").toLowerCase().includes(q)) &&
      (!who || balance(p) === OWNER_LABEL[who]) &&
      (!concept || keyOf(p) === concept) &&
      (!onlyPending || p.pending),
  );
  const shownTotal = Math.round(shown.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const filtered = shown.length !== rows.length;

  const days = new Map<string, Payment[]>();
  for (const p of shown) days.set(p.date, [...(days.get(p.date) ?? []), p]);

  const select = "h-11 rounded-xl border bg-surface px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <section aria-labelledby="list-title" className="order-3 space-y-3 lg:order-none">
      <h2 id="list-title" className="sr-only">
        Gastos del mes
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <label className="col-span-2 flex h-11 min-w-0 items-center sm:flex-[1_1_12rem] gap-2 rounded-xl border bg-surface px-3 text-muted-foreground">
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
        <select aria-label="Lo paga" value={who} onChange={(e) => setWho(e.target.value as Owner | "")} className={cn(select, "min-w-0")}>
          <option value="">Lo paga: todos</option>
          <option value="casa">Casa</option>
          <option value="ricardo">Ricardo</option>
          <option value="andrea">Andrea</option>
        </select>
        <select aria-label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} className={cn(select, "min-w-0 sm:max-w-56")}>
          <option value="">Concepto: todos</option>
          {conceptOptions.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <Chip active={onlyPending} onClick={() => setOnlyPending((v) => !v)} className="col-span-2 rounded-xl">
          Solo pendientes
        </Chip>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {shown.length === 1 ? "1 gasto" : `${shown.length} gastos`} · {formatAmount(shownTotal)}
        {filtered && " (con filtros)"}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-card border bg-card p-4 text-sm text-muted-foreground">
          {rows.length ? "Ningún gasto con estos filtros." : "Sin gastos de la Amex este mes."}
        </p>
      ) : (
        <>
          {/* Móvil: lista por día */}
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
                          <span className={cn("block truncate text-xs", p.conceptId || p.purchaseId ? "text-muted-foreground" : "text-warning")}>
                            {balance(p)} · {describe(p)}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className="text-[15px] font-bold tabular-nums">{formatAmount(p.amount)}</span>
                          <Tag p={p} />
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Ordenador: tabla */}
          <div className="hidden overflow-x-auto rounded-card border bg-card lg:block">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="border-b px-3.5 py-3">Fecha</th>
                  <th scope="col" className="border-b px-3.5 py-3">Descripción</th>
                  <th scope="col" className="border-b px-3.5 py-3">Lo paga</th>
                  <th scope="col" className="border-b px-3.5 py-3">Concepto</th>
                  <th scope="col" className="border-b px-3.5 py-3">Estado</th>
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
                    <td className="border-b px-3.5 py-2.5">{balance(p)}</td>
                    <td className={cn("border-b px-3.5 py-2.5", p.conceptId || p.purchaseId ? "text-muted-foreground" : "text-warning")}>
                      {describe(p)}
                    </td>
                    <td className="border-b px-3.5 py-2.5">
                      <Tag p={p} />
                    </td>
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

function Tag({ p }: { p: Payment }) {
  if (p.pending) return <span className="text-[11px] font-bold text-warning">PENDIENTE</span>;
  if (p.purchaseId) return <span className="text-[11px] font-bold text-brand">SUPERMERCADO</span>;
  return null;
}

function EditDialog({ payment, shared, onClose }: { payment: Payment | null; shared: Shared; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{payment ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
          <DialogDescription>
            {payment?.purchaseId ? "Compra de Supermercado pagada con Amex." : "American Express · cuenta en el Balance que elijas."}
          </DialogDescription>
        </DialogHeader>
        {payment?.purchaseId ? (
          <div className="space-y-3 text-sm">
            <p>
              {formatDate(payment.date)} · {payment.description} · <strong className="tabular-nums">{formatAmount(payment.amount)}</strong>
            </p>
            <p className="text-muted-foreground">
              Este gasto sale de una compra: se cambia o se borra desde Supermercado, y se actualiza aquí solo.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} className="h-11">
                Cerrar
              </Button>
              <Link href={`/supermercado?mes=${payment.date.slice(0, 7)}`} className={cn(buttonVariants(), "h-11 px-4")}>
                Ir a Supermercado
              </Link>
            </div>
          </div>
        ) : (
          <PaymentForm {...shared} payment={payment} idPrefix="dlg" onDone={onClose} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cuadre en vivo del periodo de la Amex (del 27 al 26, se cobra hacia el 2):
 * por persona, lo gastado, lo ya traspasado a la cuenta de Casa y lo pendiente.
 */
function CycleCard({ cycle }: { cycle: Props["data"]["cycle"] }) {
  const short = (iso: string) => formatDate(iso).slice(0, 5);
  // Cerrado cuando ya ha pasado el día de corte.
  const closed = todayIso() > cycle.to;
  const people = [
    ["Ricardo", cycle.ricardo],
    ["Andrea", cycle.andrea],
  ] as const;
  return (
    <section aria-labelledby="cycle-title" className="order-2 rounded-card border bg-card p-4 lg:order-none lg:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="cycle-title" className="text-base font-bold">
          Cuadre del periodo
        </h2>
        <p className="text-xs text-muted-foreground">
          {short(cycle.from)} – {short(cycle.to)} · {closed ? "cerrado" : "en curso"} · total {formatAmount(cycle.total)}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-2 font-semibold">Lo paga</th>
              <th scope="col" className="pb-2 text-right font-semibold">Gastado</th>
              <th scope="col" className="pb-2 text-right font-semibold">Traspasado</th>
              <th scope="col" className="pb-2 text-right font-semibold">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {people.map(([name, c]) => (
              <tr key={name} className="border-t">
                <th scope="row" className="py-2 text-left font-semibold">{name}</th>
                <td className="py-2 text-right tabular-nums">{formatAmount(c.total)}</td>
                <td className="py-2 text-right text-positive tabular-nums">{formatAmount(c.transferred)}</td>
                <td className={cn("py-2 text-right font-bold tabular-nums", c.pending > 0 ? "text-warning" : "text-muted-foreground")}>
                  {formatAmount(c.pending)}
                </td>
              </tr>
            ))}
            <tr className="border-t text-muted-foreground">
              <th scope="row" className="py-2 text-left font-semibold">Casa (sin traspaso)</th>
              <td className="py-2 text-right tabular-nums">{formatAmount(cycle.casa)}</td>
              <td className="py-2 text-right">—</td>
              <td className="py-2 text-right">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * «En vivo»: vuelve a pedir los datos cada 30 s mientras la pestaña está a la
 * vista y al volver a ella (así se ven los gastos apuntados desde Telegram o
 * desde otro móvil sin recargar).
 */
function useLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [router]);
}
