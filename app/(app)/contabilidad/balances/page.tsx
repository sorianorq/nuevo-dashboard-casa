import type { Metadata } from "next";
import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AddConceptButton, BalanceEditor, ManualModeButton } from "@/components/balances/balance-editor";
import { BalanceMonthList } from "@/components/balances/balance-month-list";
import { BalanceTable } from "@/components/balances/balance-table";
import { VIEW_LABEL, parseView, type BalanceView } from "@/components/balances/shared";
import { YearNav } from "@/components/balances/year-nav";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { SegmentedLinks } from "@/components/layout/segmented";
import { MonthNav } from "@/components/resumen/month-nav";
import { getBalance, getDataContext } from "@/lib/data";
import { formatAmount } from "@/lib/format";
import { compareYm, parseYm, todayIso, ymOf } from "@/lib/months";

export const metadata: Metadata = { title: "Balances" };

type SP = PageProps<"/contabilidad/balances">["searchParams"];
const PATH = "/contabilidad/balances";

export default function Page(props: PageProps<"/contabilidad/balances">) {
  return (
    <>
      <PageHeader title="Balances" />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await getDataContext(sp);

  const currentYm = ymOf(todayIso());
  const requested = parseYm(str(sp.mes));
  // Sin meses futuros (como en el Resumen).
  const ym = requested && compareYm(requested, currentYm) <= 0 ? requested : currentYm;
  const view = parseView(str(sp.vista));
  const monthsElapsed = ym.year < currentYm.year ? 12 : currentYm.month;

  const showAll = str(sp.todos) === "1";
  const data = await getBalance(ctx, ym.year, monthsElapsed, { includeArchived: showAll });
  const personal = ctx.tab === "personal";

  const base: Record<string, string> = {};
  if (personal) base.balance = "personal";
  const withView: Record<string, string> = {
    ...base,
    ...(view !== "real" ? { vista: view } : {}),
    ...(showAll ? { todos: "1" } : {}),
  };
  const toggleAllHref = (() => {
    const qs = new URLSearchParams({ ...withView, ...(requested ? { mes: str(sp.mes) as string } : {}) });
    if (showAll) qs.delete("todos");
    else qs.set("todos", "1");
    const s = qs.toString();
    return s ? `${PATH}?${s}` : PATH;
  })();
  const groups = data.blocks.flatMap((b) =>
    b.rows.filter((r) => r.kind === "subtotal" && !r.archived).map((r) => ({ id: r.id, name: r.name, section: b.section })),
  );
  const hiddenCount = data.hidden.length;
  const viewHref = (v: BalanceView) => {
    const qs = new URLSearchParams(base);
    if (requested) qs.set("mes", str(sp.mes) as string);
    if (v !== "real") qs.set("vista", v);
    if (showAll) qs.set("todos", "1");
    const s = qs.toString();
    return s ? `${PATH}?${s}` : PATH;
  };

  const empty = data.blocks.every((b) => b.rows.length === 0);

  return (
    <BalanceEditor
      tab={ctx.tab}
      year={ym.year}
      monthsElapsed={monthsElapsed}
      groups={groups}
      hidden={data.hidden}
      comments={data.comments}
    >
      <BalanceSwitcher
        role={ctx.role}
        person={ctx.person}
        tab={ctx.tab}
        aside={
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="lg:hidden">
              <MonthNav ym={ym} maxYm={currentYm} pathname={PATH} params={withView} />
            </div>
            <SegmentedLinks
              label="Vista"
              className="w-full lg:w-auto lg:min-w-80"
              items={(Object.keys(VIEW_LABEL) as BalanceView[]).map((v) => ({
                label: VIEW_LABEL[v],
                href: viewHref(v),
                active: v === view,
              }))}
            />
            <YearNav
              year={ym.year}
              currentYear={currentYm.year}
              pathname={PATH}
              params={withView}
              className="hidden lg:flex"
            />
          </div>
        }
      />

      {data.orphanManual.length > 0 && (
        <div role="alert" className="mb-4 flex gap-3 rounded-card border border-warning/40 bg-card p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-bold">
              Hay importes escritos a mano en {data.year} cuyo concepto no está en el catálogo; no suman en el Balance:
            </p>
            <ul className="mt-1 text-muted-foreground">
              {data.orphanManual.map((o) => (
                <li key={o.concept}>
                  {o.concept}: <span className="tabular-nums">{formatAmount(o.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {empty ? (
        <div className="space-y-4 fc-float px-6 py-10 text-center text-muted-foreground">
          <p>Este Balance aún no tiene conceptos.</p>
          <AddConceptButton variant="primary" />
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(hiddenCount > 0 || showAll) && (
              <Link
                href={toggleAllHref}
                scroll={false}
                className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-brand hover:bg-accent"
              >
                {showAll ? "Ocultar filas ocultas y archivadas" : `${hiddenCount} ${hiddenCount === 1 ? "fila oculta" : "filas ocultas"} · Mostrar`}
              </Link>
            )}
            {!showAll && hiddenCount === 0 && (
              <Link
                href={toggleAllHref}
                scroll={false}
                className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-accent"
              >
                Ver archivados
              </Link>
            )}
            {view !== "desvio" && <ManualModeButton />}
            <AddConceptButton variant="primary" />
          </div>
          </div>
          <div className="lg:hidden">
            <BalanceMonthList sheet={data} month={ym.month} view={view} showAll={showAll} />
          </div>
          <div className="hidden lg:block">
            <BalanceTable
              sheet={data}
              year={ym.year}
              view={view}
              currentMonth={ym.year === currentYm.year ? currentYm.month : null}
              showAll={showAll}
              notes={ctx.owner === "andrea"}
            />
          </div>
        </>
      )}
    </BalanceEditor>
  );
}
