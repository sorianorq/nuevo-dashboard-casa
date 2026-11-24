"use client";

import { useState, useTransition } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
 * resumen del mes elegido; debajo, una tabla por bloque (Gastos, Inversión).
 * «Editar» pone todos los importes en casillas y se guardan de una vez.
 */
export function BudgetView({ tab, monthLabel, data }: Props) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [busy, start] = useTransition();
  const editing = draft !== null;

  const gastos = data.lines.filter((l) => l.section === "gastos");
  const ahorro = data.lines.filter((l) => l.section === "ahorro");
  const withBudget = gastos.filter((l) => l.budget !== null);
  const budgetTotal = round2(withBudget.reduce((s, l) => s + (l.budget ?? 0), 0));
  const spentTotal = round2(withBudget.reduce((s, l) => s + l.spent, 0));
  const unbudgeted = round2(gastos.filter((l) => l.budget === null).reduce((s, l) => s + l.spent, 0));
  const ratio = budgetTotal > 0 ? spentTotal / budgetTotal : null;
  const left = round2(budgetTotal - spentTotal);

  const startEdit = () => setDraft(Object.fromEntries(data.lines.map((l) => [l.conceptId, toInput(l.budget)])));
  const fillAverages = () =>
    setDraft((d) =>
      d
        ? Object.fromEntries(
            data.lines.map((l) => [l.conceptId, d[l.conceptId] === "" && l.average !== null ? toInput(l.average) : d[l.conceptId]]),
          )
        : d,
    );

  const invalid = editing
    ? data.lines.filter((l) => {
        const v = draft[l.conceptId].trim();
        if (v === "") return false;
        const n = parseAmount(v);
        return n === null || Number.isNaN(n) || n < 0;
      })
    : [];

  const save = () =>
    start(async () => {
      if (!draft || invalid.length) return;
      const items = data.lines
        .map((l) => {
          const v = draft[l.conceptId].trim();
          const amount = v === "" ? null : round2(parseAmount(v) as number);
          return { conceptId: l.conceptId, amount, before: l.budget };
        })
        .filter((i) => i.amount !== i.before)
        .map(({ conceptId, amount }) => ({ conceptId, amount }));
      if (!items.length) return void setDraft(null);
      const res = await saveBudgets(tab, items);
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success(res.count === 1 ? "1 importe guardado" : `${res.count} importes guardados`);
        setDraft(null);
      });
    });

  return (
    <div className="space-y-4 lg:space-y-5">
      <section aria-labelledby="budget-summary" className="rounded-card border bg-card p-4 lg:p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="budget-summary" className="text-[13px] text-muted-foreground">
            Gastos de {monthLabel}
          </h2>
          {ratio !== null && (
            <span className={cn("text-[13px] font-bold", ratio >= WARN_RATIO ? "text-warning" : "text-brand")}>
              {formatPercent(ratio)}
            </span>
          )}
        </div>
        {budgetTotal > 0 ? (
          <>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">
              {formatAmount(spentTotal)}{" "}
              <span className="text-base font-semibold text-muted-foreground">de {formatAmount(budgetTotal)}</span>
            </p>
            {ratio !== null && <Bar ratio={ratio} warn={ratio >= WARN_RATIO} className="mt-2.5 h-2.5" label="Presupuesto de gastos usado" />}
            <p className={cn("mt-2 text-sm font-bold", left < 0 ? "text-warning" : "text-positive")}>
              {left >= 0 ? `Quedan ${formatAmount(left)}` : `▲ Te pasas en ${formatAmount(-left)}`}
              {data.isCurrentMonth && <span className="font-normal text-muted-foreground"> · a día {data.day}</span>}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Aún no hay presupuesto. Pulsa «Editar» y escribe cuánto quieres gastar al mes en cada concepto; vale para todos los
            meses.
          </p>
        )}
        {unbudgeted > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Gastado en conceptos sin presupuesto: <strong className="tabular-nums">{formatAmount(unbudgeted)}</strong>
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button onClick={save} disabled={busy || invalid.length > 0} className="h-11 rounded-xl px-5">
              {busy ? "Guardando…" : "Guardar"}
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={busy} className="h-11 rounded-xl px-4">
              Cancelar
            </Button>
            <Button variant="outline" onClick={fillAverages} disabled={busy} className="h-11 rounded-xl px-4">
              <Sparkles aria-hidden /> Rellenar vacíos con la media
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              Importe al mes, igual para todos los meses. Déjalo vacío para no presupuestar ese concepto. La media es la de los
              últimos 6 meses cerrados.
            </p>
          </>
        ) : (
          <Button onClick={startEdit} className="h-11 rounded-xl px-4">
            <Pencil aria-hidden /> Editar
          </Button>
        )}
      </div>

      <BudgetTable
        title="Gastos"
        kind="gastos"
        lines={gastos}
        draft={draft}
        onDraft={(id, v) => setDraft((d) => (d ? { ...d, [id]: v } : d))}
        invalid={new Set(invalid.map((l) => l.conceptId))}
      />
      {(ahorro.some((l) => l.budget !== null || l.spent) || editing) && ahorro.length > 0 && (
        <BudgetTable
          title="Inversión"
          kind="ahorro"
          lines={ahorro}
          draft={draft}
          onDraft={(id, v) => setDraft((d) => (d ? { ...d, [id]: v } : d))}
          invalid={new Set(invalid.map((l) => l.conceptId))}
        />
      )}
    </div>
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
  draft,
  onDraft,
  invalid,
}: {
  title: string;
  kind: "gastos" | "ahorro";
  lines: BudgetLine[];
  draft: Record<string, string> | null;
  onDraft: (id: string, value: string) => void;
  invalid: Set<string>;
}) {
  const editing = draft !== null;
  // Fuera de edición: solo lo que tiene presupuesto o gasto este mes.
  const shown = editing ? lines : lines.filter((l) => l.budget !== null || l.spent);
  const isExpense = kind === "gastos";
  const budgetSum = round2(shown.reduce((s, l) => s + (l.budget ?? 0), 0));
  const spentSum = round2(shown.reduce((s, l) => s + l.spent, 0));
  const th = "px-2 py-2 text-right text-xs font-bold text-muted-foreground first:pl-4 first:text-left last:pr-4 lg:first:pl-5 lg:last:pr-5";
  const td = "px-2 py-2.5 text-right tabular-nums first:pl-4 first:text-left last:pr-4 lg:first:pl-5 lg:last:pr-5";

  return (
    <section aria-labelledby={`budget-${kind}`} className="overflow-hidden rounded-card border bg-card">
      <h2 id={`budget-${kind}`} className="px-4 pt-4 pb-1 text-base font-bold lg:px-5">
        {title}
      </h2>
      {shown.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Nada este mes.</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className={editing ? "w-28 lg:w-36" : "w-[5.5rem] lg:w-32"} />
            <col className="w-[5.5rem] lg:w-32" />
            {!editing && <col className="w-[5.5rem] lg:w-32" />}
          </colgroup>
          <thead className="border-b">
            <tr>
              <th scope="col" className={th}>
                Concepto
              </th>
              <th scope="col" className={th}>
                Presup./mes
              </th>
              <th scope="col" className={th}>
                {isExpense ? "Gastado" : "Real"}
              </th>
              {!editing && (
                <th scope="col" className={th}>
                  {isExpense ? "Queda" : "Falta"}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => {
              const budget = l.budget;
              const ratio = budget && budget > 0 ? l.spent / budget : null;
              const diff = budget === null ? null : round2(budget - l.spent);
              const over = isExpense && diff !== null && diff < 0;
              const warn = isExpense && ratio !== null && ratio >= WARN_RATIO;
              return (
                <tr key={l.conceptId} className="border-b last:border-b-0">
                  <td className={td}>
                    <span className="block truncate font-semibold">{l.name}</span>
                    {l.parentName && <span className="block truncate text-xs text-muted-foreground">{l.parentName}</span>}
                  </td>
                  <td className={td}>
                    {editing ? (
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
                      formatAmount(budget)
                    )}
                  </td>
                  <td className={cn(td, warn && "font-bold text-warning")}>{formatAmount(l.spent)}</td>
                  {!editing && (
                    <td className={cn(td, "font-bold", over ? "text-warning" : "text-foreground")}>
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
                <td className={cn(td, "font-bold")}>{formatAmount(budgetSum)}</td>
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
