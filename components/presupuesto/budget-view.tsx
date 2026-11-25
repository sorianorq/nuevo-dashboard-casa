"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseAmount } from "@/components/balances/balance-editor";
import { cn } from "@/lib/utils";
import { formatAmount, formatPercent } from "@/lib/format";
import { round2, WARN_RATIO, type BudgetLine } from "@/lib/calc/budget";
import type { BudgetData } from "@/lib/data/budget";
import { saveBudgets } from "@/app/(app)/contabilidad/presupuesto/actions";

type Props = {
  tab: "casa" | "personal";
  monthLabel: string;
  data: BudgetData;
};

const toInput = (v: number | null) =>
  v === null ? "" : v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false });

/**
 * Presupuesto del Balance: un importe fijo al mes por concepto. Arriba, el
 * resumen del mes elegido; debajo, una tabla por bloque (Gastos, Inversión)
 * solo con los conceptos que están en el presupuesto. «Añadir concepto» mete
 * uno nuevo; «Editar o quitar» cambia importes o los saca (se guarda de una vez).
 */
export function BudgetView({ tab, monthLabel, data }: Props) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ conceptId: string | null; section: "gastos" | "ahorro" | null } | null>(null);
  const [busy, start] = useTransition();
  const editing = draft !== null;

  // En el presupuesto = tiene importe al mes (aunque sea 0).
  const included = data.lines.filter((l) => l.budget !== null);
  const gastos = included.filter((l) => l.section === "gastos");
  const ahorro = included.filter((l) => l.section === "ahorro");
  const outside = data.lines.filter((l) => l.budget === null && l.spent > 0);
  const candidates = data.lines.filter((l) => l.budget === null && !l.archived);
  /** Nómina del mes (base de los %), null si no hay o aún no se ha cobrado. */
  const base = data.income?.amount ?? null;

  const startEdit = () => {
    setRemoved(new Set());
    setDraft(Object.fromEntries(included.map((l) => [l.conceptId, toInput(l.budget)])));
  };
  const cancelEdit = () => {
    setDraft(null);
    setRemoved(new Set());
  };
  const toggleRemoved = (id: string) =>
    setRemoved((r) => {
      const next = new Set(r);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const invalid = editing
    ? included.filter((l) => {
        if (removed.has(l.conceptId)) return false;
        const v = draft[l.conceptId].trim();
        if (v === "") return false;
        const n = parseAmount(v);
        return n === null || Number.isNaN(n) || n < 0;
      })
    : [];

  const save = () =>
    start(async () => {
      if (!draft || invalid.length) return;
      const items = included
        .map((l) => {
          const v = draft[l.conceptId].trim();
          // Vacío o quitado = fuera del presupuesto.
          const amount = removed.has(l.conceptId) || v === "" ? null : round2(parseAmount(v) as number);
          return { conceptId: l.conceptId, amount, before: l.budget };
        })
        .filter((i) => i.amount !== i.before)
        .map(({ conceptId, amount }) => ({ conceptId, amount }));
      if (!items.length) return void cancelEdit();
      const res = await saveBudgets(tab, items);
      if (!res.ok) return void toast.error(res.error);
      const gone = items.filter((i) => i.amount === null).length;
      start(() => {
        toast.success(
          gone === items.length
            ? gone === 1
              ? "1 concepto quitado del presupuesto"
              : `${gone} conceptos quitados del presupuesto`
            : res.count === 1
              ? "1 cambio guardado"
              : `${res.count} cambios guardados`,
        );
        cancelEdit();
      });
    });

  const tableProps = {
    draft,
    onDraft: (id: string, v: string) => setDraft((d) => (d ? { ...d, [id]: v } : d)),
    invalid: new Set(invalid.map((l) => l.conceptId)),
    removed,
    onToggleRemoved: toggleRemoved,
  };

  return (
    <div className="space-y-4 lg:space-y-5">
      {data.income && (
        <p className="text-sm text-muted-foreground">
          {base !== null ? (
            <>
              {data.income.label} de {monthLabel}: <strong className="text-foreground tabular-nums">{formatAmount(base)}</strong>
              <span className="text-xs"> · los % son sobre esta cifra</span>
            </>
          ) : (
            <>
              {data.income.label}: aún no hay cobro en {monthLabel}. Los % aparecerán cuando llegue.
            </>
          )}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Summary kind="gastos" monthLabel={monthLabel} data={data} lines={gastos} outside={outside} base={base} />
        <Summary kind="ahorro" monthLabel={monthLabel} data={data} lines={ahorro} outside={outside} base={base} />
      </div>

      {(editing || included.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button onClick={save} disabled={busy || invalid.length > 0} className="h-11 rounded-xl px-5">
                {busy ? "Guardando…" : "Guardar"}
              </Button>
              <Button variant="outline" onClick={cancelEdit} disabled={busy} className="h-11 rounded-xl px-4">
                Cancelar
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                Cambia los importes al mes (iguales para todos los meses) o pulsa × para quitar un concepto del presupuesto.
                No se guarda nada hasta que pulses «Guardar».
              </p>
            </>
          ) : (
            <Button variant="outline" onClick={startEdit} className="h-11 rounded-xl px-4">
              <Pencil aria-hidden /> Editar o quitar
            </Button>
          )}
        </div>
      )}

      {(["gastos", "ahorro"] as const).map((kind) => (
        <BudgetTable
          key={kind}
          title={kind === "gastos" ? "Gastos" : "Inversión"}
          kind={kind}
          lines={kind === "gastos" ? gastos : ahorro}
          base={base}
          canAdd={!editing && candidates.some((c) => c.section === kind)}
          onAdd={() => setAdding({ conceptId: null, section: kind })}
          {...tableProps}
        />
      ))}

      {outside.length > 0 && !editing && (
        <Outside lines={outside} canAdd={(id) => candidates.some((c) => c.conceptId === id)} onAdd={(id) => setAdding({ conceptId: id, section: null })} />
      )}

      {adding && (
        <AddDialog
          tab={tab}
          candidates={adding.section ? candidates.filter((c) => c.section === adding.section) : candidates}
          section={adding.section}
          initialId={adding.conceptId}
          base={base}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

const pctOf = (amount: number, base: number | null) => (base && base > 0 ? formatPercent(amount / base) : null);

/** Resumen del mes de un bloque: Gastos (lo que queda) o Inversión (lo que falta por apartar). */
function Summary({
  kind,
  monthLabel,
  data,
  lines,
  outside,
  base,
}: {
  kind: "gastos" | "ahorro";
  monthLabel: string;
  data: BudgetData;
  lines: BudgetLine[];
  outside: BudgetLine[];
  base: number | null;
}) {
  const isExpense = kind === "gastos";
  const budgetTotal = round2(lines.reduce((s, l) => s + (l.budget ?? 0), 0));
  const realTotal = round2(lines.reduce((s, l) => s + l.spent, 0));
  const extra = round2(outside.filter((l) => l.section === kind).reduce((s, l) => s + l.spent, 0));
  const ratio = budgetTotal > 0 ? realTotal / budgetTotal : null;
  const left = round2(budgetTotal - realTotal);
  const warn = isExpense && ratio !== null && ratio >= WARN_RATIO;
  const id = `budget-summary-${kind}`;
  const budgetPct = pctOf(budgetTotal, base);
  const realPct = pctOf(realTotal + extra, base);

  return (
    <section aria-labelledby={id} className="rounded-card border bg-card p-4 lg:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-[13px] text-muted-foreground">
          {isExpense ? "Gastos" : "Inversión"} de {monthLabel}
        </h2>
        {ratio !== null && (
          <span className={cn("text-[13px] font-bold", warn ? "text-warning" : "text-brand")}>{formatPercent(ratio)}</span>
        )}
      </div>
      {budgetTotal > 0 ? (
        <>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">
            {formatAmount(realTotal)}{" "}
            <span className="text-base font-semibold text-muted-foreground">de {formatAmount(budgetTotal)}</span>
          </p>
          {ratio !== null && (
            <Bar
              ratio={ratio}
              warn={warn}
              className="mt-2.5 h-2.5"
              label={isExpense ? "Presupuesto de gastos usado" : "Inversión del mes hecha"}
            />
          )}
          {isExpense ? (
            <p className={cn("mt-2 text-sm font-bold", left < 0 ? "text-warning" : "text-positive")}>
              {left >= 0 ? `Quedan ${formatAmount(left)}` : `▲ Te pasas en ${formatAmount(-left)}`}
              {data.isCurrentMonth && <span className="font-normal text-muted-foreground"> · a día {data.day}</span>}
            </p>
          ) : (
            <p className={cn("mt-2 text-sm font-bold", left > 0 ? "text-foreground" : "text-positive")}>
              {left > 0 ? `Faltan ${formatAmount(left)} por invertir` : "✓ Inversión del mes hecha"}
              {data.isCurrentMonth && <span className="font-normal text-muted-foreground"> · a día {data.day}</span>}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          {isExpense
            ? "Aún no hay gastos en el presupuesto. Pulsa «Añadir» en la tabla de Gastos."
            : "Aún no hay inversión en el presupuesto. Pulsa «Añadir» en la tabla de Inversión."}
        </p>
      )}
      {(budgetPct || realPct) && (budgetTotal > 0 || realTotal + extra > 0) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sobre la nómina:{" "}
          {budgetTotal > 0 && (
            <>
              presupuesto <strong className="text-foreground tabular-nums">{budgetPct}</strong>
              {" · "}
            </>
          )}
          {isExpense ? "gastado en total" : "invertido en total"}{" "}
          <strong className="text-foreground tabular-nums">{realPct}</strong>
        </p>
      )}
      {extra > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {isExpense ? "Gastado" : "Invertido"} fuera del presupuesto:{" "}
          <strong className="tabular-nums">{formatAmount(extra)}</strong>
        </p>
      )}
    </section>
  );
}

/** Conceptos con gasto este mes que no están en el presupuesto (plegado). */
function Outside({ lines, canAdd, onAdd }: { lines: BudgetLine[]; canAdd: (id: string) => boolean; onAdd: (id: string) => void }) {
  const total = round2(lines.reduce((s, l) => s + l.spent, 0));
  return (
    <details className="group overflow-hidden rounded-card border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 lg:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
          <span>
            <span className="block text-sm font-bold">Fuera del presupuesto</span>
            <span className="block text-xs text-muted-foreground">
              {lines.length} {lines.length === 1 ? "concepto" : "conceptos"} con gasto este mes
            </span>
          </span>
        </span>
        <span className="text-sm font-bold tabular-nums">{formatAmount(total)}</span>
      </summary>
      <ul className="border-t">
        {lines.map((l) => (
          <li key={l.conceptId} className="flex items-center gap-2 border-b px-4 py-2 last:border-b-0 lg:px-5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{l.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {l.section === "ahorro" ? "Inversión" : "Gastos"}
                {l.parentName ? ` · ${l.parentName}` : ""}
              </span>
            </span>
            <span className="text-sm tabular-nums">{formatAmount(l.spent)}</span>
            {canAdd(l.conceptId) && (
              <Button variant="outline" size="sm" onClick={() => onAdd(l.conceptId)} className="h-9 rounded-lg">
                <Plus aria-hidden /> Añadir
              </Button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

const lineLabel = (l: BudgetLine) => (l.parentName ? `${l.name} (${l.parentName})` : l.name);

/** Elegir un concepto que no está en el presupuesto y ponerle importe al mes. */
function AddDialog({
  tab,
  candidates,
  section,
  initialId,
  base,
  onClose,
}: {
  tab: "casa" | "personal";
  candidates: BudgetLine[];
  section: "gastos" | "ahorro" | null;
  initialId: string | null;
  base: number | null;
  onClose: () => void;
}) {
  const [conceptId, setConceptId] = useState(initialId ?? "");
  const first = candidates.find((c) => c.conceptId === initialId);
  const [amount, setAmount] = useState(first?.average != null ? toInput(first.average) : "");
  const [touched, setTouched] = useState(false);
  const [busy, start] = useTransition();
  const chosen = candidates.find((c) => c.conceptId === conceptId) ?? null;
  const parsed = amount.trim() === "" ? null : parseAmount(amount);
  const valid = chosen !== null && parsed !== null && !Number.isNaN(parsed) && parsed >= 0;
  const groups = [
    { label: "Gastos", items: candidates.filter((c) => c.section === "gastos") },
    { label: "Inversión", items: candidates.filter((c) => c.section === "ahorro") },
  ].filter((g) => g.items.length);

  const choose = (id: string) => {
    setConceptId(id);
    // Propone la media mientras no se haya escrito un importe a mano.
    const c = candidates.find((x) => x.conceptId === id);
    if (!touched) setAmount(c?.average != null ? toInput(c.average) : "");
  };

  const submit = () =>
    start(async () => {
      if (!valid || !chosen) return;
      const res = await saveBudgets(tab, [{ conceptId: chosen.conceptId, amount: round2(parsed as number) }]);
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success(`${chosen.name} añadido al presupuesto`);
        onClose();
      });
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{section === "ahorro" ? "Añadir a Inversión" : section === "gastos" ? "Añadir a Gastos" : "Añadir concepto"}</DialogTitle>
          <DialogDescription>
            {section === "ahorro"
              ? "Elige el concepto y cuánto quieres invertir al mes. Vale para todos los meses."
              : "Elige el concepto y cuánto quieres gastar al mes. Vale para todos los meses."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="budget-concept" className="text-xs font-bold text-muted-foreground">
              Concepto
            </label>
            <select
              id="budget-concept"
              value={conceptId}
              onChange={(e) => choose(e.target.value)}
              className="h-11 w-full min-w-0 rounded-xl border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                Elige un concepto…
              </option>
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((c) => (
                    <option key={c.conceptId} value={c.conceptId}>
                      {lineLabel(c)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="budget-amount" className="text-xs font-bold text-muted-foreground">
              Importe al mes (€)
            </label>
            <input
              id="budget-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setTouched(true);
                setAmount(e.target.value);
              }}
              aria-invalid={amount.trim() !== "" && !valid}
              className="h-11 w-full rounded-xl border bg-surface px-3 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
            />
            {chosen && (
              <p className="text-xs text-muted-foreground">
                {chosen.average !== null
                  ? `Media de los últimos 6 meses cerrados: ${formatAmount(chosen.average)}`
                  : "Sin movimientos en los últimos 6 meses."}
                {valid && base ? ` · ${pctOf(parsed as number, base)} de la nómina` : ""}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="h-11">
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || busy} className="h-11">
              {busy ? "Guardando…" : "Añadir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Bar({ ratio, warn, className, label }: { ratio: number; warn?: boolean; className?: string; label: string }) {
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
        className={cn("h-full rounded-full", warn ? "bg-warning" : "bg-brand")}
        style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
      />
    </div>
  );
}

function BudgetTable({
  title,
  kind,
  lines,
  base,
  canAdd,
  onAdd,
  draft,
  onDraft,
  invalid,
  removed,
  onToggleRemoved,
}: {
  title: string;
  kind: "gastos" | "ahorro";
  lines: BudgetLine[];
  base: number | null;
  canAdd: boolean;
  onAdd: () => void;
  draft: Record<string, string> | null;
  onDraft: (id: string, value: string) => void;
  invalid: Set<string>;
  removed: Set<string>;
  onToggleRemoved: (id: string) => void;
}) {
  const editing = draft !== null;
  const shown = lines;
  const isExpense = kind === "gastos";
  const budgetSum = round2(shown.reduce((s, l) => s + (l.budget ?? 0), 0));
  const spentSum = round2(shown.reduce((s, l) => s + l.spent, 0));
  const showPct = base !== null;
  // En edición, el % sigue a lo que se va escribiendo.
  const amountOf = (l: BudgetLine) => {
    if (!editing) return l.budget;
    if (removed.has(l.conceptId)) return null;
    const v = parseAmount(draft[l.conceptId] ?? "");
    return v === null || Number.isNaN(v) || v < 0 ? null : v;
  };
  const pctSum = round2(shown.reduce((s, l) => s + (amountOf(l) ?? 0), 0));
  const th = "px-2 py-2 text-right text-xs font-bold text-muted-foreground first:pl-4 first:text-left last:pr-4 lg:first:pl-5 lg:last:pr-5";
  const td = "px-2 py-2.5 text-right tabular-nums first:pl-4 first:text-left last:pr-4 lg:first:pl-5 lg:last:pr-5";

  return (
    <section aria-labelledby={`budget-${kind}`} className="overflow-hidden rounded-card border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1 lg:px-5">
        <h2 id={`budget-${kind}`} className="text-base font-bold">
          {title}
        </h2>
        {canAdd && (
          <Button variant="outline" size="sm" onClick={onAdd} className="h-9 rounded-lg">
            <Plus aria-hidden /> Añadir
          </Button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Ningún concepto en el presupuesto.</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className={editing ? "w-28 lg:w-36" : "w-[5.5rem] lg:w-32"} />
            {showPct && <col className="hidden w-24 sm:table-column lg:w-28" />}
            <col className="w-[5.5rem] lg:w-32" />
            <col className={editing ? "w-12" : "w-[5.5rem] lg:w-32"} />
          </colgroup>
          <thead className="border-b">
            <tr>
              <th scope="col" className={th}>
                Concepto
              </th>
              <th scope="col" className={th}>
                {showPct ? (
                  <>
                    <span className="sm:hidden">Presup. · %</span>
                    <span className="hidden sm:inline">Presup./mes</span>
                  </>
                ) : (
                  "Presup./mes"
                )}
              </th>
              {showPct && (
                <th scope="col" className={cn(th, "hidden sm:table-cell")}>
                  % nómina
                </th>
              )}
              <th scope="col" className={th}>
                {isExpense ? "Gastado" : "Real"}
              </th>
              <th scope="col" className={th}>
                {editing ? <span className="sr-only">Quitar</span> : isExpense ? "Queda" : "Falta"}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => {
              const budget = l.budget;
              const ratio = budget && budget > 0 ? l.spent / budget : null;
              const diff = budget === null ? null : round2(budget - l.spent);
              const over = isExpense && diff !== null && diff < 0;
              const warn = isExpense && ratio !== null && ratio >= WARN_RATIO;
              const gone = editing && removed.has(l.conceptId);
              const pct = showPct ? pctOf(amountOf(l) ?? 0, base) : null;
              const hasAmount = amountOf(l) !== null;
              return (
                <tr key={l.conceptId} className={cn("border-b last:border-b-0", gone && "bg-muted/50 text-muted-foreground")}>
                  <td className={td}>
                    <span className={cn("block truncate font-semibold", gone && "line-through")}>{l.name}</span>
                    {l.parentName && <span className="block truncate text-xs text-muted-foreground">{l.parentName}</span>}
                  </td>
                  <td className={td}>
                    {gone ? (
                      <span className="text-xs">Se quitará</span>
                    ) : editing ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <input
                          aria-label={`Presupuesto al mes de ${l.name}`}
                          inputMode="decimal"
                          placeholder={l.average !== null ? `media ${l.average}` : "—"}
                          value={draft[l.conceptId]}
                          onChange={(e) => onDraft(l.conceptId, e.target.value)}
                          aria-invalid={invalid.has(l.conceptId)}
                          className="h-10 w-full rounded-lg border bg-surface px-2 text-right tabular-nums outline-none placeholder:text-xs placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
                        />
                      </span>
                    ) : budget === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        {formatAmount(budget)}
                        {pct && <span className="block text-[11px] whitespace-nowrap text-muted-foreground sm:hidden">{pct}</span>}
                      </>
                    )}
                  </td>
                  {showPct && (
                    <td className={cn(td, "hidden text-muted-foreground sm:table-cell")}>{hasAmount && !gone ? pct : "—"}</td>
                  )}
                  <td className={cn(td, warn && "font-bold text-warning")}>{formatAmount(l.spent)}</td>
                  {editing ? (
                    <td className={cn(td, "px-1")}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onToggleRemoved(l.conceptId)}
                        aria-label={gone ? `No quitar ${l.name}` : `Quitar ${l.name} del presupuesto`}
                        title={gone ? "Deshacer" : "Quitar del presupuesto"}
                        className="size-10 rounded-lg"
                      >
                        {gone ? <RotateCcw aria-hidden /> : <X aria-hidden />}
                      </Button>
                    </td>
                  ) : (
                    <td className={cn(td, "font-bold whitespace-nowrap", over ? "text-warning" : "text-foreground")}>
                      {diff === null ? (
                        <span className="font-normal text-muted-foreground">sin presup.</span>
                      ) : isExpense ? (
                        over ? (
                          `▲ ${formatAmount(-diff)}`
                        ) : (
                          formatAmount(diff)
                        )
                      ) : diff > 0 ? (
                        formatAmount(diff)
                      ) : (
                        <span className="text-positive">✓</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {!editing && budgetSum > 0 && (
            <tfoot className="border-t bg-muted/40">
              <tr>
                <th scope="row" className={cn(td, "font-bold")}>
                  Total
                </th>
                <td className={cn(td, "font-bold")}>
                  {formatAmount(budgetSum)}
                  {showPct && (
                    <span className="block text-[11px] font-normal whitespace-nowrap text-muted-foreground sm:hidden">{pctOf(pctSum, base)}</span>
                  )}
                </td>
                {showPct && <td className={cn(td, "hidden font-bold sm:table-cell")}>{pctOf(pctSum, base)}</td>}
                <td className={cn(td, "font-bold")}>{formatAmount(spentSum)}</td>
                <td className={td} />
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </section>
  );
}
