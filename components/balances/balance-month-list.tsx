import Link from "next/link";
import { ChevronRight, Link2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmount, formatSignedAmount } from "@/lib/format";
import type { BalanceRow, BalanceSheet } from "@/lib/calc/balance";
import { SECTION_LABEL, type ConceptSection } from "@/lib/labels";
import { cellHref, cellNote, deviationTone, valuesFor, type BalanceView } from "./shared";

const TOTAL_LABEL: Record<ConceptSection, string> = {
  ingresos: "Total ingresos",
  gastos: "Total gastos",
  ahorro: "Total ahorro",
};

/** Balance de un mes (móvil): conceptos en lista; en Real, presupuesto en gris debajo. */
export function BalanceMonthList({
  sheet,
  year,
  month,
  view,
  personal,
}: {
  sheet: BalanceSheet;
  year: number;
  month: number;
  view: BalanceView;
  personal: boolean;
}) {
  const i = month - 1;

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
    const href = view === "real" ? cellHref(r, year, i, sheet.monthsElapsed, personal) : null;
    const content = (
      <>
        <span className={cn("min-w-0 flex-1", r.depth === 1 ? "pl-4 text-[13px]" : "", r.kind === "subtotal" && "font-extrabold")}>
          <span className="inline-flex items-center gap-1.5">
            <span className="break-words">{r.name}</span>
            {r.kind === "linked" && <Link2 className="size-3.5 shrink-0 text-brand" aria-label="automático" />}
            {view === "real" && r.manualOverride[i] && (
              <PenLine className="size-3.5 shrink-0 text-brand" aria-label="escrito a mano" />
            )}
          </span>
        </span>
        {amount(r, section, r.kind === "subtotal")}
        {href && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </>
    );
    const cls = cn("flex min-h-11 items-center gap-2 border-b py-2", r.archived && "text-muted-foreground");
    return href ? (
      <li key={r.id}>
        <Link href={href} className={cn(cls, "hover:bg-accent")} title={cellNote(r, i)}>
          {content}
        </Link>
      </li>
    ) : (
      <li key={r.id} className={cls} title={view === "real" ? cellNote(r, i) : undefined}>
        {content}
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
            {block.rows.flatMap((r) => [row(r, block.section), ...r.children.map((c) => row(c, block.section))])}
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
