"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmount, formatCellRounded, formatCellSigned, formatSignedAmount } from "@/lib/format";
import { yearTotal, type BalanceRow, type BalanceSheet, type MonthValues } from "@/lib/calc/balance";
import { SECTION_LABEL, type ConceptSection } from "@/lib/labels";
import { cellNote, deviationTone, valuesFor, type BalanceView } from "./shared";
import {
  AddConceptButton,
  ConceptMenu,
  ConceptNoteInput,
  DeleteConceptButton,
  HideRowButton,
  ManualCellInput,
  useBalanceEditor,
  useDisplaySheet,
} from "./balance-editor";
import { DragHandle, dropClasses, endClasses, rowDragAttrs, useRowDrag } from "./row-drag";

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const TOTAL_LABEL: Record<ConceptSection, string> = {
  ingresos: "Total ingresos",
  gastos: "Total gastos",
  ahorro: "Total inversión",
};

/** Hoja anual (ordenador): concepto × enero–diciembre + total. */
export function BalanceTable({
  sheet: savedSheet,
  year,
  view,
  currentMonth,
  showAll,
  notes = false,
}: {
  sheet: BalanceSheet;
  year: number;
  view: BalanceView;
  /** Mes en curso (1..12) si el año es el actual; null en años pasados. */
  currentMonth: number | null;
  /** Mostrar también las filas ocultas por el usuario. */
  showAll: boolean;
  /** Columna de texto libre junto al concepto (Balance de Andrea). */
  notes?: boolean;
}) {
  const { openCell, comments, hidden, manual } = useBalanceEditor();
  const sheet = useDisplaySheet(savedSheet);
  const cols = notes ? 15 : 14;
  // La caja ocupa lo que queda de pantalla desde donde empieza: así la barra de
  // scroll horizontal queda siempre a la vista (sin bajar hasta el final).
  const boxRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => {
      const el = boxRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setMaxHeight(Math.max(360, window.innerHeight - top - 24));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
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
  const drag = useRowDrag();

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
          const typing = Boolean(manual && row && row.kind !== "subtotal" && (view === "real" || view === "presupuesto"));
          const comment = row && view === "real" ? comments[row.id]?.[i] : null;
          const title = row && view === "real" ? [full, cellNote(row, i), comment].filter(Boolean).join(" · ") : full;
          return (
            <td
              key={i}
              title={title}
              className={cn(
                "border-b px-1.5 py-2 text-right whitespace-nowrap tabular-nums",
                i + 1 === currentMonth && "bg-brand-soft/60",
                v === null && "text-muted-foreground",
                (tone ?? resultTone) === "positive" && "text-positive",
                (tone ?? resultTone) === "warning" && "text-warning",
                opts.strong && "font-extrabold",
              )}
            >
              {typing && row ? (
                <ManualCellInput
                  row={row}
                  monthIndex={i}
                  field={view === "presupuesto" ? "budget" : "real"}
                  value={v}
                  label={`${row.name}, ${MONTH_LABELS[i]}${view === "presupuesto" ? " (presupuesto)" : ""}`}
                  className="w-[3.9rem] px-1 text-[12px]"
                />
              ) : editable && row ? (
                <button
                  type="button"
                  onClick={() => openCell(row, i)}
                  aria-label={`${row.name}, ${MONTH_LABELS[i]}: ${full}${comment ? ", con comentario" : ""}. Editar`}
                  className="relative -mx-1 inline-flex min-h-8 items-center gap-0.5 rounded px-1 hover:bg-accent hover:text-brand"
                >
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

  const conceptRow = (row: BalanceRow, section: ConceptSection, groupId: string | null = null) => {
    const isSub = row.kind === "subtotal";
    const open = !collapsed.has(row.id);
    return (
      <tr
        key={row.id}
        {...rowDragAttrs(row, section, groupId)}
        className={cn("group/row", (row.archived || hidden.has(row.id)) && "text-muted-foreground", dropClasses(drag, row.id, true))}
      >
        <th
          scope="row"
          className={cn(
            "sticky left-0 z-10 border-b bg-surface py-2 pr-3 text-left font-medium",
            row.depth === 1 ? "pl-9 text-[13px]" : "pl-4",
            isSub && "font-extrabold",
          )}
        >
          <span className="flex items-center gap-1.5">
            <DragHandle
              row={row}
              section={section}
              drag={drag}
              className="-ml-3 h-7 w-5 opacity-30 group-hover/row:opacity-100 focus-visible:opacity-100"
            />
            <DeleteConceptButton row={row} className="-ml-2" />
            <HideRowButton row={row} className="-ml-1.5" />
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
            {!notes && row.periodicity && <span className="text-[11px] font-medium text-muted-foreground">{row.periodicity}</span>}
            {row.archived && <span className="text-[11px] font-semibold">(archivado)</span>}
            {hidden.has(row.id) && <span className="text-[11px] font-semibold text-muted-foreground">(oculto)</span>}
            <ConceptMenu row={row} className="ml-auto" />
          </span>
        </th>
        {notes && (
          <td className="border-b px-1 py-1">
            <ConceptNoteInput row={row} />
          </td>
        )}
        {valueCells(valuesFor(row, view), section, { row, strong: isSub })}
      </tr>
    );
  };

  return (
    // Caja con su propio scroll (como Excel): cabecera de meses y columna de conceptos fijas,
    // y la barra horizontal siempre a la vista cuando no caben todos los meses.
    <div
      ref={boxRef}
      data-wide
      data-drag-scope
      style={maxHeight ? { maxHeight } : undefined}
      className="scrollbar-visible max-h-[calc(100dvh-22rem)] min-h-[360px] overflow-auto fc-float"
    >
      <table className={cn("w-full border-collapse text-[13px]", notes ? "min-w-[1100px]" : "min-w-[1010px]")}>
        <caption className="sr-only">
          Balance {year}, vista {view}. Importes en euros con un decimal.
        </caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="sticky top-0 left-0 z-30 min-w-[190px] border-b bg-surface px-4 py-3 text-left font-semibold">
              Concepto
            </th>
            {notes && (
              <th scope="col" className="sticky top-0 z-20 min-w-[104px] border-b bg-surface px-2 py-3 text-left font-semibold">
                Notas
              </th>
            )}
            {MONTH_LABELS.map((m, i) => (
              <th
                key={m}
                scope="col"
                className={cn(
                  "sticky top-0 z-20 border-b bg-surface px-1.5 py-3 text-right font-semibold",
                  i + 1 === currentMonth && "bg-brand-soft font-extrabold text-brand",
                )}
                aria-current={i + 1 === currentMonth ? "date" : undefined}
              >
                {m}
              </th>
            ))}
            <th scope="col" className="sticky top-0 z-20 border-b bg-surface py-3 pr-4 pl-2 text-right font-extrabold text-foreground">
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
                  colSpan={cols}
                  className="sticky left-0 border-b bg-brand-soft px-4 py-2 text-left text-xs font-extrabold tracking-[0.08em] text-brand uppercase"
                >
                  {SECTION_LABEL[block.section]}
                </th>
              </tr>
              {block.rows.length === 0 && (
                <tr>
                  <td colSpan={cols} className="border-b px-4 py-3 text-muted-foreground">
                    Sin conceptos en este bloque.
                  </td>
                </tr>
              )}
              {block.rows.filter(visible).flatMap((row) => [
                conceptRow(row, block.section),
                ...(row.kind === "subtotal" && !collapsed.has(row.id)
                  ? row.children.filter(visible).map((child) => conceptRow(child, block.section, row.id))
                  : []),
              ])}
              <tr className={endClasses(drag, block.section, true)}>
                <td colSpan={cols} className="sticky left-0 border-b px-4">
                  <AddConceptButton section={block.section} />
                </td>
              </tr>
              <tr className="bg-background">
                <th scope="row" className="sticky left-0 z-10 border-b bg-background px-4 py-2 text-left font-extrabold">
                  {TOTAL_LABEL[block.section]}
                </th>
                {notes && <td className="border-b" />}
                {valueCells(valuesFor(block.total, view), block.section, { strong: true })}
              </tr>
            </Fragment>
          ))}
          <tr className="bg-brand-soft">
            <th scope="row" className="sticky left-0 z-10 bg-brand-soft px-4 py-3 text-left font-extrabold">
              Resultado
            </th>
            {notes && <td />}
            {valueCells(valuesFor(sheet.result, view), "resultado", { strong: true })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
