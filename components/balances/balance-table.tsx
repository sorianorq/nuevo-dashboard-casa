"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDown, Link2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmount, formatCellRounded, formatCellSigned, formatSignedAmount } from "@/lib/format";
import { yearTotal, type BalanceRow, type BalanceSheet, type MonthValues } from "@/lib/calc/balance";
import { SECTION_LABEL, type ConceptSection } from "@/lib/labels";
import { cellHref, cellNote, deviationTone, valuesFor, type BalanceView } from "./shared";

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const TOTAL_LABEL: Record<ConceptSection, string> = {
  ingresos: "Total ingresos",
  gastos: "Total gastos",
  ahorro: "Total ahorro",
};

/** Hoja anual (ordenador): concepto × enero–diciembre + total. */
export function BalanceTable({
  sheet,
  year,
  view,
  currentMonth,
  personal,
}: {
  sheet: BalanceSheet;
  year: number;
  view: BalanceView;
  /** Mes en curso (1..12) si el año es el actual; null en años pasados. */
  currentMonth: number | null;
  personal: boolean;
}) {
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
          const href = opts.row && view === "real" ? cellHref(opts.row, year, i, sheet.monthsElapsed, personal) : null;
          const override = opts.row && view === "real" && opts.row.manualOverride[i];
          const title = opts.row && view === "real" ? `${full} · ${cellNote(opts.row, i)}` : full;
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
              {href ? (
                <Link href={href} className="-mx-1 rounded px-1 underline-offset-2 hover:text-brand hover:underline">
                  {text}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-0.5">
                  {override && <PenLine className="size-3 text-brand" aria-label="Escrito a mano" />}
                  {text}
                </span>
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
      <tr key={row.id} className={cn(row.archived && "text-muted-foreground")}>
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
            {row.archived && <span className="text-[11px] font-semibold">(archivado)</span>}
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
              {block.rows.flatMap((row) => [
                conceptRow(row, block.section),
                ...(row.kind === "subtotal" && !collapsed.has(row.id)
                  ? row.children.map((child) => conceptRow(child, block.section))
                  : []),
              ])}
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
