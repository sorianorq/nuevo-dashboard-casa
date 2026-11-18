"use client";

import { Fragment, useState } from "react";
import { ChevronDown, Link2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmount, formatCellRounded, formatCellSigned, formatSignedAmount } from "@/lib/format";
import { yearTotal, type BalanceRow, type BalanceSheet, type MonthValues } from "@/lib/calc/balance";
import { SECTION_LABEL, type ConceptSection } from "@/lib/labels";
import { cellNote, deviationTone, valuesFor, type BalanceView } from "./shared";
import { AddConceptButton, ConceptMenu, useBalanceEditor } from "./balance-editor";

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const TOTAL_LABEL: Record<ConceptSection, string> = {
  ingresos: "Total ingresos",
  gastos: "Total gastos",
  ahorro: "Total inversión",
};

/** Hoja anual (ordenador): concepto × enero–diciembre + total. */
export function BalanceTable({
  sheet,
  year,
  view,
  currentMonth,
  showAll,
}: {
  sheet: BalanceSheet;
  year: number;
  view: BalanceView;
  /** Mes en curso (1..12) si el año es el actual; null en años pasados. */
  currentMonth: number | null;
  /** Mostrar también las filas ocultas por el usuario. */
  showAll: boolean;
}) {
  const { openCell, comments, hidden } = useBalanceEditor();
  const visible = (r: BalanceRow) => showAll || !hidden.has(r.id);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const signed = view === "desvio";

  const valueCells = (
    values: MonthValues,
    section: ConceptSection | "resultado",
    opts: { row?: BalanceRow; strong?: boolean } = {},
  ) => {
    const total = yearTotal(values);
    return (
      <>
        {values.map((v, i) => {
          const tone = signed && v !== null ? deviationTone(v, section) : null;
          const resultTone = !signed && section === "resultado" && v !== null && Math.abs(v) >= 0.005 ? (v > 0 ? "positive" : "warning") : null;
          const text = v === null ? "—" : signed ? formatCellSigned(v) : formatCellRounded(v);
          const full = v === null ? "Sin dato" : signed || section === "resultado" ? formatSignedAmount(v) : formatAmount(v);
          const row = opts.row;
          const editable = Boolean(row && view === "real" && row.kind !== "subtotal");
          const override = row && view === "real" && row.manualOverride[i];
          const comment = row && view === "real" ? comments[row.id]?.[i] : null;
          const title = row && view === "real" ? [full, cellNote(row, i), comment].filter(Boolean).join(" · ") : full;
          return (
            <td
              key={i}
              title={title}
              className={cn(
                "border-b px-2 py-2 text-right whitespace-nowrap tabular-nums",
                i + 1 === currentMonth && "bg-brand-soft/60",
                v === null && "text-muted-foreground",
                (tone ?? resultTone) === "positive" && "text-positive",
                (tone ?? resultTone) === "warning" && "text-warning",
                opts.strong && "font-extrabold",
              )}
            >
              {editable && row ? (
                <button
                  type="button"
                  onClick={() => openCell(row, i)}
                  aria-label={`${row.name}, ${MONTH_LABELS[i]}: ${full}${comment ? ", con comentario" : ""}. Editar`}
                  className="relative -mx-1 inline-flex min-h-8 items-center gap-0.5 rounded px-1 hover:bg-accent hover:text-brand"
                >
                  {override && <PenLine className="size-3 text-brand" aria-hidden />}
                  {text}
                  {comment && <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-brand" aria-hidden />}
                </button>
              ) : (
                <span className="inline-flex items-center gap-0.5">{text}</span>
              )}
            </td>
          );
        })}
        <td
          title={total === null ? "Sin dato" : signed ? formatSignedAmount(total) : formatAmount(total)}
          className={cn(
            "border-b py-2 pr-4 pl-2 text-right font-extrabold whitespace-nowrap tabular-nums",
            total === null && "text-muted-foreground",
            signed && total !== null && deviationTone(total, section) === "positive" && "text-positive",
            signed && total !== null && deviationTone(total, section) === "warning" && "text-warning",
            !signed && section === "resultado" && total !== null && total > 0 && "text-positive",
            !signed && section === "resultado" && total !== null && total < 0 && "text-warning",
          )}
        >
          {total === null ? "—" : signed || section === "resultado" ? formatCellSigned(total) : formatCellRounded(total)}
        </td>
      </>
    );
  };

  const conceptRow = (row: BalanceRow, section: ConceptSection) => {
    const isSub = row.kind === "subtotal";
    const open = !collapsed.has(row.id);
    return (
      <tr key={row.id} className={cn((row.archived || hidden.has(row.id)) && "text-muted-foreground")}>
        <th
          scope="row"
          className={cn(
            "sticky left-0 z-10 border-b bg-surface py-2 pr-3 text-left font-medium",
            row.depth === 1 ? "pl-9 text-[13px]" : "pl-4",
            isSub && "font-extrabold",
          )}
        >
          <span className="flex items-center gap-1.5">
            {isSub ? (
              <button
                type="button"
                onClick={() => toggle(row.id)}
                aria-expanded={open}
                className="-ml-2 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 hover:bg-accent"
              >
                <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} aria-hidden />
                {row.name}
                <span className="sr-only">{open ? " (plegar)" : " (desplegar)"}</span>
              </button>
            ) : (
              <span className="truncate">{row.name}</span>
            )}
            {row.kind === "linked" && <Link2 className="size-3.5 shrink-0 text-brand" aria-label="automático" />}
            {row.periodicity && <span className="text-[11px] font-medium text-muted-foreground">{row.periodicity}</span>}
            {row.archived && <span className="text-[11px] font-semibold">(archivado)</span>}
            {hidden.has(row.id) && <span className="text-[11px] font-semibold text-muted-foreground">(oculto)</span>}
            <ConceptMenu row={row} className="ml-auto" />
          </span>
        </th>
        {valueCells(valuesFor(row, view), section, { row, strong: isSub })}
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto rounded-card border bg-card">
      <table className="w-full min-w-[1120px] border-collapse text-[13px]">
        <caption className="sr-only">
          Balance {year}, vista {view}. Cifras redondeadas al euro; el importe exacto aparece al pasar el ratón.
        </caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="sticky left-0 z-10 min-w-[220px] border-b bg-surface px-4 py-3 text-left font-semibold">
              Concepto
            </th>
            {MONTH_LABELS.map((m, i) => (
              <th
                key={m}
                scope="col"
                className={cn(
                  "border-b px-2 py-3 text-right font-semibold",
                  i + 1 === currentMonth && "bg-brand-soft/60 font-extrabold text-brand",
                )}
                aria-current={i + 1 === currentMonth ? "date" : undefined}
              >
                {m}
              </th>
            ))}
            <th scope="col" className="border-b py-3 pr-4 pl-2 text-right font-extrabold text-foreground">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {sheet.blocks.map((block) => (
            <Fragment key={block.section}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={14}
                  className="sticky left-0 border-b bg-brand-soft px-4 py-2 text-left text-xs font-extrabold tracking-[0.08em] text-brand uppercase"
                >
                  {SECTION_LABEL[block.section]}
                </th>
              </tr>
              {block.rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="border-b px-4 py-3 text-muted-foreground">
                    Sin conceptos en este bloque.
                  </td>
                </tr>
              )}
              {block.rows.filter(visible).flatMap((row) => [
                conceptRow(row, block.section),
                ...(row.kind === "subtotal" && !collapsed.has(row.id)
                  ? row.children.filter(visible).map((child) => conceptRow(child, block.section))
                  : []),
              ])}
              <tr>
                <td colSpan={14} className="sticky left-0 border-b px-4">
                  <AddConceptButton section={block.section} />
                </td>
              </tr>
              <tr className="bg-background">
                <th scope="row" className="sticky left-0 z-10 border-b bg-background px-4 py-2 text-left font-extrabold">
                  {TOTAL_LABEL[block.section]}
                </th>
                {valueCells(valuesFor(block.total, view), block.section, { strong: true })}
              </tr>
            </Fragment>
          ))}
          <tr className="bg-brand-soft">
            <th scope="row" className="sticky left-0 z-10 bg-brand-soft px-4 py-3 text-left font-extrabold">
              Resultado
            </th>
            {valueCells(valuesFor(sheet.result, view), "resultado", { strong: true })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
