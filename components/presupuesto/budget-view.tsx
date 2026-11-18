"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Copy, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseAmount } from "@/components/balances/balance-editor";
import { cn } from "@/lib/utils";
import { formatAmount, formatPercent } from "@/lib/format";
import { SECTION_LABEL, SECTION_ORDER, type ConceptSection } from "@/lib/labels";
import { round2, WARN_RATIO, type BudgetLine } from "@/lib/calc/budget";
import type { BudgetData } from "@/lib/data/budget";
import { saveBudgets } from "@/app/(app)/contabilidad/presupuesto/actions";

type Props = {
  tab: "casa" | "personal";
  /** YYYY-MM del mes en pantalla. */
  month: string;
  monthLabel: string;
  data: BudgetData;
};

const toInput = (v: number | null) =>
  v === null ? "" : v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false });

/** Presupuesto del Balance: resumen, partidas por bloque y acciones. */
export function BudgetView({ tab, month, monthLabel, data }: Props) {
  const [dialog, setDialog] = useState<
    { kind: "line"; line: BudgetLine } | { kind: "add" } | { kind: "propose" } | null
  >(null);
  const [busy, start] = useTransition();

  const gastos = data.lines.filter((l) => l.section === "gastos");
  const budgetTotal = round2(gastos.reduce((s, l) => s + (l.budget ?? 0), 0));
  const spentTotal = round2(gastos.reduce((s, l) => s + (l.spent ?? 0), 0));
  const forecastTotal = data.isCurrentMonth ? round2(gastos.reduce((s, l) => s + (l.forecast ?? 0), 0)) : null;
  const ratio = budgetTotal > 0 && !data.isFuture ? spentTotal / budgetTotal : null;

  const copy = () =>
    start(async () => {
      const res = await saveBudgets(
        tab,
        month,
        data.copyable.map((c) => ({ conceptId: c.conceptId, amount: c.amount })),
        true,
      );
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success(res.count === 1 ? "1 partida copiada" : `${res.count} partidas copiadas`);
      });
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 lg:mb-5">
        <Button onClick={() => setDialog({ kind: "add" })} disabled={!data.available.length} className="h-11 rounded-xl px-4">
          <Plus aria-hidden /> Partida
        </Button>
        <Button variant="outline" onClick={copy} disabled={busy || !data.copyable.length} className="h-11 rounded-xl px-4">
          <Copy aria-hidden />
          {busy ? "Copiando…" : data.copyable.length ? `Copiar mes anterior (${data.copyable.length})` : "Copiar mes anterior"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setDialog({ kind: "propose" })}
          disabled={!data.proposals.length}
          className="h-11 rounded-xl px-4"
        >
          <Sparkles aria-hidden /> Proponer con histórico
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-5">
        <div className="space-y-4 lg:space-y-5">
          <section aria-label={`Gastos de ${monthLabel} frente al presupuesto`} className="rounded-card border bg-card p-4 lg:p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[13px] text-muted-foreground">Gastado / presupuestado</h2>
              {ratio !== null && (
                <span className={cn("text-[13px] font-bold", ratio >= WARN_RATIO ? "text-warning" : "text-brand")}>
                  {formatPercent(ratio)}
                </span>
              )}
            </div>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">
              {data.isFuture ? "—" : formatAmount(spentTotal)}{" "}
              <span className="text-base font-semibold text-muted-foreground">/ {formatAmount(budgetTotal)}</span>
            </p>
            {ratio !== null && <Bar ratio={ratio} warn={ratio >= WARN_RATIO} className="mt-2.5 h-2.5" label="Presupuesto de gastos usado" />}
            {forecastTotal !== null && budgetTotal > 0 && (
              <p className={cn("mt-2 text-[13px] font-bold", forecastTotal > budgetTotal ? "text-warning" : "text-positive")}>
                Previsión a fin de mes: {formatAmount(forecastTotal)} ·{" "}
                {forecastTotal > budgetTotal
                  ? `▲ te pasarías en ${formatAmount(forecastTotal - budgetTotal)}`
                  : "dentro del presupuesto"}
              </p>
            )}
            {!data.lines.length && (
              <p className="mt-2 text-sm text-muted-foreground">
                Este mes no tiene partidas. Añade una, copia las del mes anterior o pide una propuesta con el histórico.
              </p>
            )}
            {data.unbudgetedSpent > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Gastado en conceptos sin partida: <strong className="tabular-nums">{formatAmount(data.unbudgetedSpent)}</strong>
              </p>
            )}
          </section>

          <Block section="gastos" lines={gastos} future={data.isFuture} onOpen={(line) => setDialog({ kind: "line", line })} />
        </div>
        <div className="space-y-4 lg:space-y-5">
          {(["ahorro", "ingresos"] as ConceptSection[]).map((s) => (
            <Block
              key={s}
              section={s}
              lines={data.lines.filter((l) => l.section === s)}
              future={data.isFuture}
              onOpen={(line) => setDialog({ kind: "line", line })}
            />
          ))}
        </div>
      </div>

      {dialog?.kind === "line" && (
        <LineDialog tab={tab} month={month} line={dialog.line} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "add" && <AddDialog tab={tab} month={month} data={data} onClose={() => setDialog(null)} />}
      {dialog?.kind === "propose" && (
        <ProposeDialog tab={tab} month={month} monthLabel={monthLabel} data={data} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

function Bar({ ratio, warn, good, className, label }: { ratio: number; warn?: boolean; good?: boolean; className?: string; label: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      className={cn("overflow-hidden rounded-full bg-track", className)}
    >
      <div
        className={cn("h-full rounded-full", warn ? "bg-warning" : good ? "bg-positive" : "bg-brand")}
        style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
      />
    </div>
  );
}

function Block({
  section,
  lines,
  future,
  onOpen,
}: {
  section: ConceptSection;
  lines: BudgetLine[];
  future: boolean;
  onOpen: (l: BudgetLine) => void;
}) {
  if (!lines.length && section !== "gastos") return null;
  const isExpense = section === "gastos";
  return (
    <section aria-labelledby={`block-${section}`} className="rounded-card border bg-card p-4 lg:p-5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={`block-${section}`} className="text-base font-bold">
          {SECTION_LABEL[section]}
        </h2>
        <span className="text-xs text-muted-foreground">{isExpense ? "gastado / presupuesto" : "real / previsto"}</span>
      </div>
      {lines.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">Sin partidas.</p>
      ) : (
        <ul>
          {lines
            .slice()
            .sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0))
            .map((l) => {
              const budget = l.budget ?? 0;
              const spent = l.spent ?? 0;
              const ratio = budget > 0 ? spent / budget : spent > 0 ? 1 : 0;
              const warn = isExpense && !future && ratio >= WARN_RATIO;
              const left = round2(budget - spent);
              return (
                <li key={l.conceptId} className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpen(l)}
                    className="flex w-full items-center gap-2 py-2.5 text-left hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-semibold">
                          {l.name}
                          {l.parentName && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{l.parentName}</span>}
                        </span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          <strong className={cn("text-foreground", warn && "text-warning")}>{future ? "—" : formatAmount(spent)}</strong> /{" "}
                          {formatAmount(budget)}
                        </span>
                      </span>
                      <Bar ratio={ratio} warn={warn} good={!isExpense && ratio >= 1} className="h-2" label={`${l.name}: usado`} />
                      {!future && (
                        <span className={cn("block text-xs", warn ? "text-warning" : "text-muted-foreground")}>
                          {isExpense
                            ? left >= 0
                              ? `Quedan ${formatAmount(left)} · ${formatPercent(ratio)}`
                              : `▲ Te pasas en ${formatAmount(-left)} · ${formatPercent(ratio)}`
                            : left > 0
                              ? `Faltan ${formatAmount(left)} · ${formatPercent(ratio)}`
                              : `Conseguido · ${formatPercent(ratio)}`}
                          {l.forecast !== null && isExpense && l.forecast !== l.spent && ` · previsión ${formatAmount(l.forecast)}`}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}

function sourceLink(tab: string, month: string, l: BudgetLine): { href: string; label: string } {
  const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const balance: Record<string, string> = tab === "personal" ? { balance: "personal" } : {};
  if (l.linkSource === "movimientos") {
    return { href: `/movimientos?${qs({ ...balance, concepto: l.conceptId, mes: month })}`, label: "Ver movimientos" };
  }
  if (l.linkSource === "supermercado") return { href: `/supermercado?${qs({ mes: month })}`, label: "Ver Supermercado" };
  if (l.linkSource === "pagos") {
    return { href: `/movimientos?${qs({ ...balance, cuenta: "a-mano", concepto: l.conceptId, mes: month })}`, label: "Ver gastos a mano" };
  }
  return { href: `/contabilidad/balances?${qs({ ...balance, mes: month })}`, label: "Ver en Balances (importe a mano)" };
}

function LineDialog({ tab, month, line, onClose }: { tab: string; month: string; line: BudgetLine; onClose: () => void }) {
  const [amount, setAmount] = useState(toInput(line.budget));
  const [busy, start] = useTransition();
  const parsed = parseAmount(amount);
  const valid = parsed !== null && !Number.isNaN(parsed) && parsed >= 0;
  const link = sourceLink(tab, month, line);

  const save = (value: number | null) =>
    start(async () => {
      const res = await saveBudgets(tab, month, [{ conceptId: line.conceptId, amount: value }]);
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success(value === null ? "Partida quitada" : "Partida guardada");
        onClose();
      });
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{line.name}</DialogTitle>
          <DialogDescription>
            {line.spent === null ? "Mes futuro: aún sin gasto." : `Gastado este mes: ${formatAmount(line.spent)}`}
            {line.forecast !== null && ` · previsión ${formatAmount(line.forecast)}`}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && parsed !== null) save(parsed);
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="line-amount" className="text-xs font-bold text-muted-foreground">
              Presupuesto del mes
            </label>
            <Input
              id="line-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={amount !== "" && !valid}
              className="h-11 tabular-nums"
            />
          </div>
          <Link href={link.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline">
            {link.label}
          </Link>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => save(null)} className="h-11 sm:mr-auto">
              Quitar partida
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose} className="h-11">
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || busy} className="h-11">
              {busy ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({ tab, month, data, onClose }: { tab: string; month: string; data: BudgetData; onClose: () => void }) {
  const [conceptId, setConceptId] = useState(data.available.find((c) => c.section === "gastos")?.id ?? data.available[0]?.id ?? "");
  const proposal = data.proposals.find((p) => p.conceptId === conceptId);
  const [amount, setAmount] = useState(proposal ? toInput(proposal.amount) : "");
  const [busy, start] = useTransition();
  const parsed = parseAmount(amount);
  const valid = conceptId !== "" && parsed !== null && !Number.isNaN(parsed) && parsed >= 0;

  const save = () =>
    start(async () => {
      if (parsed === null) return;
      const res = await saveBudgets(tab, month, [{ conceptId, amount: parsed }]);
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success("Partida añadida");
        onClose();
      });
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva partida</DialogTitle>
          <DialogDescription>Un concepto de este Balance y su presupuesto del mes.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="add-concept" className="text-xs font-bold text-muted-foreground">
              Concepto
            </label>
            <select
              id="add-concept"
              value={conceptId}
              onChange={(e) => {
                setConceptId(e.target.value);
                const p = data.proposals.find((x) => x.conceptId === e.target.value);
                setAmount(p ? toInput(p.amount) : "");
              }}
              className="h-11 w-full rounded-xl border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SECTION_ORDER.map((s) => {
                const items = data.available.filter((c) => c.section === s);
                if (!items.length) return null;
                return (
                  <optgroup key={s} label={SECTION_LABEL[s]}>
                    {items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.parentName ? `${c.name} (${c.parentName})` : c.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="add-amount" className="text-xs font-bold text-muted-foreground">
              Presupuesto del mes
            </label>
            <Input
              id="add-amount"
              inputMode="decimal"
              placeholder="0 €"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 tabular-nums"
            />
            {proposal && (
              <p className="text-xs text-muted-foreground">
                Propuesta con histórico: {formatAmount(proposal.amount)} (media de {proposal.months}{" "}
                {proposal.months === 1 ? "mes con gasto" : "meses con gasto"} de los últimos 6).
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose} className="h-11">
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || busy} className="h-11">
              {busy ? "Guardando…" : "Añadir partida"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProposeDialog({
  tab,
  month,
  monthLabel,
  data,
  onClose,
}: {
  tab: string;
  month: string;
  monthLabel: string;
  data: BudgetData;
  onClose: () => void;
}) {
  // Por defecto, las que aún no tienen partida y tuvieron gasto en 3 o más de los 6 meses
  // (un pago anual o puntual daría una media mensual engañosa).
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(data.proposals.filter((p) => p.current === null && p.months >= 3).map((p) => p.conceptId)),
  );
  const [busy, start] = useTransition();
  const picked = data.proposals.filter((p) => chosen.has(p.conceptId));

  const apply = () =>
    start(async () => {
      const res = await saveBudgets(
        tab,
        month,
        picked.map((p) => ({ conceptId: p.conceptId, amount: p.amount })),
      );
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success(res.count === 1 ? "1 partida guardada" : `${res.count} partidas guardadas`);
        onClose();
      });
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Propuesta para {monthLabel}</DialogTitle>
          <DialogDescription>
            Media de los últimos 6 meses cerrados, sin meses atípicos (los que pasan del doble de lo normal), redondeada al
            euro. Los conceptos con gasto en menos de 3 meses (pagos anuales o puntuales) salen sin marcar.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-xl border">
          {data.proposals.map((p) => (
            <li key={p.conceptId}>
              <label className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.has(p.conceptId)}
                  onChange={(e) =>
                    setChosen((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.conceptId);
                      else next.delete(p.conceptId);
                      return next;
                    })
                  }
                  className="size-5 shrink-0 accent-brand"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {SECTION_LABEL[p.section]} · {p.months} {p.months === 1 ? "mes con gasto" : "meses con gasto"}
                    {p.current !== null && ` · ahora ${formatAmount(p.current)}`}
                  </span>
                </span>
                <span className="font-bold tabular-nums">{formatAmount(p.amount)}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose} className="h-11">
            Cancelar
          </Button>
          <Button type="button" disabled={!picked.length || busy} onClick={apply} className="h-11">
            {busy ? "Guardando…" : `Aplicar (${picked.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
