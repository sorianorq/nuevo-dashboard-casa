"use client";

import { Link2, MessageSquare, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmount, formatSignedAmount } from "@/lib/format";
import type { BalanceRow, BalanceSheet } from "@/lib/calc/balance";
import { SECTION_LABEL, type ConceptSection } from "@/lib/labels";
import { cellNote, deviationTone, valuesFor, type BalanceView } from "./shared";
import { AddConceptButton, ConceptMenu, DeleteConceptButton, HideRowButton, ManualCellInput, useBalanceEditor, useDisplaySheet } from "./balance-editor";

const TOTAL_LABEL: Record<ConceptSection, string> = {
  ingresos: "Total ingresos",
  gastos: "Total gastos",
  ahorro: "Total inversión",
};

/** Balance de un mes (móvil): conceptos en lista; en Real, presupuesto en gris debajo. */
export function BalanceMonthList({
  sheet: savedSheet,
  month,
  view,
  showAll,
}: {
  sheet: BalanceSheet;
  month: number;
  view: BalanceView;
  showAll: boolean;
}) {
  const { openCell, comments, hidden, manual } = useBalanceEditor();
  const sheet = useDisplaySheet(savedSheet);
  const i = month - 1;
  const visible = (r: BalanceRow) => showAll || !hidden.has(r.id);

  const amount = (
    item: { real: (number | null)[]; budget: (number | null)[]; deviation: (number | null)[] },
    section: ConceptSection | "resultado",
    strong = false,
  ) => {
    const v = valuesFor(item, view)[i];
    const budget = item.budget[i];
    const tone = view === "desvio" && v !== null ? deviationTone(v, section) : null;
    return (
      <span className="flex min-w-24 flex-col items-end gap-0.5 tabular-nums">
        <span
          className={cn(
            strong ? "font-extrabold" : "font-semibold",
            v === null && "font-medium text-muted-foreground",
            tone === "positive" && "text-positive",
            tone === "warning" && "text-warning",
          )}
        >
          {v === null ? "—" : view === "desvio" ? formatSignedAmount(v) : formatAmount(v)}
        </span>
        {view === "real" && budget !== null && (
          <span className="text-[11px] text-muted-foreground">
            <span className="sr-only">Presupuesto: </span>
            {formatAmount(budget)}
          </span>
        )}
      </span>
    );
  };

  const row = (r: BalanceRow, section: ConceptSection) => {
    const editable = view === "real" && r.kind !== "subtotal" && !manual;
    const comment = comments[r.id]?.[i];
    const content = (
      <>
        <span className={cn("min-w-0 flex-1 text-left", r.depth === 1 && "pl-4 text-[13px]", r.kind === "subtotal" && "font-extrabold")}>
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <span className="break-words">{r.name}</span>
            {r.kind === "linked" && <Link2 className="size-3.5 shrink-0 text-brand" aria-label="automático" />}
            {view === "real" && r.manualOverride[i] && (
              <PenLine className="size-3.5 shrink-0 text-brand" aria-label="escrito a mano" />
            )}
            {comment && <MessageSquare className="size-3.5 shrink-0 text-brand" aria-label="con comentario" />}
            {r.archived && <span className="text-[11px] font-semibold">(archivado)</span>}
            {hidden.has(r.id) && <span className="text-[11px] font-semibold">(oculto)</span>}
          </span>
          {comment && <span className="mt-0.5 block text-xs text-muted-foreground">{comment}</span>}
        </span>
        {manual && r.kind !== "subtotal" && (view === "real" || view === "presupuesto") ? (
          <ManualCellInput
            row={r}
            monthIndex={i}
            field={view === "presupuesto" ? "budget" : "real"}
            value={valuesFor(r, view)[i]}
            label={`${r.name}${view === "presupuesto" ? " (presupuesto)" : ""}`}
            className="h-11 w-28 shrink-0 text-base"
          />
        ) : (
          amount(r, section, r.kind === "subtotal")
        )}
      </>
    );
    return (
      <li
        key={r.id}
        className={cn("flex items-center gap-1 border-b", (r.archived || hidden.has(r.id)) && "text-muted-foreground")}
      >
        <DeleteConceptButton row={r} className="size-9" />
        <HideRowButton row={r} className="size-9" />
        {editable ? (
          <button
            type="button"
            onClick={() => openCell(r, i)}
            title={cellNote(r, i)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 hover:bg-accent"
          >
            {content}
          </button>
        ) : (
          <span className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2">{content}</span>
        )}
        <ConceptMenu row={r} className="size-11" />
      </li>
    );
  };

  const result = valuesFor(sheet.result, view)[i];

  return (
    <section className="rounded-card border bg-card px-4 pb-2" aria-label={`Balance del mes, vista ${view}`}>
      {sheet.blocks.map((block) => (
        <div key={block.section}>
          <h2 className="pt-4 pb-1.5 text-xs font-extrabold tracking-[0.1em] text-brand uppercase">
            {SECTION_LABEL[block.section]}
          </h2>
          <ul>
            {block.rows.length === 0 && (
              <li className="border-b py-3 text-muted-foreground">Sin conceptos en este bloque.</li>
            )}
            {block.rows
              .filter(visible)
              .flatMap((r) => [row(r, block.section), ...r.children.filter(visible).map((c) => row(c, block.section))])}
            <li className="border-b">
              <AddConceptButton section={block.section} />
            </li>
            <li className="-mx-4 flex min-h-11 items-center gap-2 border-b bg-background px-4 py-2 font-extrabold">
              <span className="flex-1">{TOTAL_LABEL[block.section]}</span>
              {amount(block.total, block.section, true)}
            </li>
          </ul>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 pt-3.5 pb-2">
        <span className="text-[15px] font-extrabold">Resultado del mes</span>
        {result === null ? (
          <span className="text-lg font-extrabold text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              "text-lg font-extrabold tabular-nums",
              result > 0.004 && "text-positive",
              result < -0.004 && "text-warning",
            )}
          >
            {result > 0.004 ? "▲ " : result < -0.004 ? "▼ " : ""}
            {formatSignedAmount(result)}
          </span>
        )}
      </div>
    </section>
  );
}
