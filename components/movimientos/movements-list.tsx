"use client";

import { useOptimistic, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatDate, formatDayHeading, formatSignedAmount } from "@/lib/format";
import { FLOWS, type Account, type Flow, type Transaction } from "@/lib/labels";
import type { ManualRow, QuickAddData } from "@/lib/data/pagos";
import type { Payment } from "@/lib/calc/pagos";
import { changeFlow } from "@/app/(app)/movimientos/actions";
import { ManualPaymentDialog } from "./manual-payment-dialog";
import { ConceptPicker } from "./concept-picker";
import { useConceptChange } from "./concept-change";
import { useConcepts } from "./concepts-context";

export type ManualForm = QuickAddData & { today: string };

type Item = { kind: "bank"; date: string; tx: Transaction } | { kind: "manual"; date: string; row: ManualRow };

/**
 * Lista de movimientos: los del banco y los gastos apuntados a mano, por
 * fecha. Móvil: agrupada por día (tocar abre la edición). Ordenador: tabla
 * fecha · descripción · cuenta · concepto · importe.
 */
export function MovementsList({
  rows,
  accounts,
  manual = [],
  form,
}: {
  rows: Transaction[];
  accounts: Account[];
  manual?: ManualRow[];
  form: ManualForm;
}) {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingManual, setEditingManual] = useState<Payment | null>(null);
  const [optimistic, patch] = useOptimistic(rows, (state, p: { id: string } & Partial<Transaction>) =>
    state.map((r) => (r.id === p.id ? { ...r, ...p } : r)),
  );

  if (rows.length === 0 && manual.length === 0) {
    return (
      <p className="fc-float px-6 py-12 text-center text-muted-foreground">
        No hay movimientos con estos filtros.
      </p>
    );
  }

  // Más reciente primero; en el mismo día, el orden de cada origen se conserva (orden estable).
  const items: Item[] = [
    ...optimistic.map((tx) => ({ kind: "bank" as const, date: tx.date, tx })),
    ...manual.map((row) => ({ kind: "manual" as const, date: row.payment.date, row })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const byDay = new Map<string, Item[]>();
  for (const it of items) {
    const list = byDay.get(it.date);
    if (list) list.push(it);
    else byDay.set(it.date, [it]);
  }
  const current = editing ? (optimistic.find((r) => r.id === editing.id) ?? editing) : null;
  const openManual = (payment: Payment) => setEditingManual(payment);

  return (
    <>
      {/* Móvil */}
      <div className="space-y-4 lg:hidden">
        {[...byDay.entries()].map(([day, list]) => (
          <section key={day} aria-label={formatDayHeading(day)}>
            <h3 className="mb-1.5 px-1 text-xs font-bold text-muted-foreground">{formatDayHeading(day)}</h3>
            <ul className="divide-y fc-float">
              {list.map((it) =>
                it.kind === "manual" ? (
                  <li key={`m-${it.row.payment.id}`}>
                    <button
                      type="button"
                      onClick={() => openManual(it.row.payment)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{it.row.payment.description || "Sin descripción"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <ManualConcept row={it.row} /> · <ManualTag /> {it.row.means}
                        </span>
                      </span>
                      <ManualAmount row={it.row} />
                    </button>
                  </li>
                ) : (
                  <li key={it.tx.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(it.tx)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{it.tx.description}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <ConceptLabel tx={it.tx} /> · {accountName.get(it.tx.accountId ?? "") ?? "Cuenta"}
                        </span>
                      </span>
                      <Amount tx={it.tx} />
                    </button>
                  </li>
                ),
              )}

            </ul>
          </section>
        ))}
      </div>

      {/* Ordenador */}
      <div className="hidden overflow-hidden fc-float lg:block">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b bg-surface text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-[104px] px-4 py-3 text-left font-semibold">Fecha</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Descripción</th>
              <th scope="col" className="w-[160px] px-3 py-3 text-left font-semibold">Cuenta</th>
              <th scope="col" className="w-[240px] px-3 py-3 text-left font-semibold">Concepto</th>
              <th scope="col" className="w-[136px] px-3 py-3 text-right font-semibold">Importe</th>
              <th scope="col" className="w-[56px] px-2 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((it) => {
              if (it.kind === "manual") {
                const p = it.row.payment;
                return (
                  <tr key={`m-${p.id}`} className="align-middle hover:bg-accent/40">
                    <td className="px-4 py-2 tabular-nums">{formatDate(p.date)}</td>
                    <td className="px-3 py-2">
                      <span className="block truncate font-medium" title={p.description}>{p.description || "Sin descripción"}</span>
                    </td>
                    <td className="truncate px-3 py-2 text-muted-foreground">
                      <ManualTag /> {it.row.means}
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => openManual(p)} className="block max-w-full truncate px-3 text-left hover:underline">
                        <ManualConcept row={it.row} />
                      </button>
                    </td>
                    <td className="px-3 py-2"><ManualAmount row={it.row} /></td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => openManual(p)}
                        aria-label={`Editar gasto: ${p.description}`}
                        className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <MoreHorizontal className="size-5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              }
              const r = it.tx;
              return (
              <tr key={r.id} className="align-middle hover:bg-accent/40">
                <td className="px-4 py-2 tabular-nums">{formatDate(r.date)}</td>
                <td className="px-3 py-2">
                  <span className="block truncate font-medium" title={r.description}>{r.description}</span>
                  {r.flow !== "normal" && (
                    <span className="mt-0.5 inline-block rounded-md bg-track px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {FLOWS[r.flow]} · no cuenta
                    </span>
                  )}
                </td>
                <td className="truncate px-3 py-2 text-muted-foreground">{accountName.get(r.accountId ?? "") ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <InlineConcept tx={r} onOptimistic={patch} />
                </td>
                <td className="px-3 py-2"><Amount tx={r} /></td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    aria-label={`Editar movimiento: ${r.description}`}
                    className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="size-5" aria-hidden />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EditSheet
        tx={current}
        accountName={current ? (accountName.get(current.accountId ?? "") ?? "—") : ""}
        onClose={() => setEditing(null)}
        onOptimistic={patch}
      />

      {editingManual && (
        <ManualPaymentDialog
          key={editingManual.id}
          payment={editingManual}
          form={form}
          onClose={() => setEditingManual(null)}
        />
      )}
    </>
  );
}

/** Etiqueta de los gastos apuntados a mano. */
function ManualTag() {
  return <span className="rounded-md bg-track px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">A mano</span>;
}

function ManualConcept({ row }: { row: ManualRow }) {
  return row.concept ? <span>{row.concept}</span> : <span className="font-semibold text-warning">Sin concepto</span>;
}

function ManualAmount({ row }: { row: ManualRow }) {
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <span className="amount block font-bold">{formatSignedAmount(-row.payment.amount)}</span>
      {row.payment.pending && <span className="text-[11px] font-bold text-warning">PENDIENTE</span>}
    </span>
  );
}

function Amount({ tx }: { tx: Transaction }) {
  const counts = tx.flow === "normal";
  return (
    <span
      className={cn(
        "amount block font-bold",
        !counts && "text-muted-foreground line-through decoration-1",
        counts && tx.amount > 0 && "text-positive",
      )}
      title={counts ? undefined : "No cuenta en ingresos ni gastos"}
    >
      {formatSignedAmount(tx.amount)}
    </span>
  );
}

function ConceptLabel({ tx }: { tx: Transaction }) {
  const { byId } = useConcepts();
  if (tx.flow !== "normal") return <span>{FLOWS[tx.flow]}</span>;
  const c = tx.conceptId ? byId.get(tx.conceptId) : undefined;
  return c ? <span>{c.name}</span> : <span className="font-semibold text-warning">Sin concepto</span>;
}

type Patch = (p: { id: string } & Partial<Transaction>) => void;

function InlineConcept({ tx, onOptimistic }: { tx: Transaction; onOptimistic: Patch }) {
  const { setConcept } = useConceptChange();
  const [pending, start] = useTransition();
  if (tx.flow !== "normal") return <span className="px-3 text-xs text-muted-foreground">No cuenta</span>;
  return (
    <ConceptPicker
      value={tx.conceptId}
      disabled={pending}
      defaultSection={tx.amount > 0 ? "ingresos" : "gastos"}
      label={`Concepto de ${tx.description}`}
      onChange={(id) =>
        start(async () => {
          onOptimistic({ id: tx.id, conceptId: id });
          await setConcept(tx.id, id);
        })
      }
    />
  );
}

function EditSheet({
  tx,
  accountName,
  onClose,
  onOptimistic,
}: {
  tx: Transaction | null;
  accountName: string;
  onClose: () => void;
  onOptimistic: Patch;
}) {
  const { tab } = useConcepts();
  const { setConcept } = useConceptChange();
  const [pending, start] = useTransition();

  return (
    <Sheet open={tx !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl px-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        {tx && (
          <>
            <SheetHeader className="pt-6">
              <SheetTitle className="pr-10 text-[18px] leading-snug font-extrabold break-words">{tx.description}</SheetTitle>
              <SheetDescription>
                {formatDate(tx.date)} · {accountName}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-2">
              <p className="text-[24px] font-extrabold"><Amount tx={tx} /></p>

              <div className="space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">Concepto</p>
                {tx.flow === "normal" ? (
                  <ConceptPicker
                    value={tx.conceptId}
                    disabled={pending}
                    defaultSection={tx.amount > 0 ? "ingresos" : "gastos"}
                    onChange={(id) =>
                      start(async () => {
                        onOptimistic({ id: tx.id, conceptId: id });
                        await setConcept(tx.id, id);
                      })
                    }
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Este movimiento no cuenta en ingresos ni gastos; no lleva concepto.
                  </p>
                )}
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-xs font-bold text-muted-foreground">Tipo</legend>
                <div className="grid gap-1 rounded-2xl bg-track p-1">
                  {(Object.keys(FLOWS) as Flow[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={tx.flow === f}
                      disabled={pending}
                      onClick={() =>
                        tx.flow !== f &&
                        start(async () => {
                          onOptimistic({ id: tx.id, flow: f });
                          const res = await changeFlow(tab, tx.id, f);
                          if (res.ok) toast.success("Tipo guardado");
                          else toast.error(res.error);
                        })
                      }
                      className={cn(
                        "min-h-11 rounded-xl px-3 text-left text-sm",
                        tx.flow === f ? "bg-surface font-bold shadow-sm" : "font-semibold text-muted-foreground",
                      )}
                    >
                      {FLOWS[f]}
                      {f !== "normal" && <span className="ml-1.5 text-xs font-medium text-muted-foreground">no cuenta</span>}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
