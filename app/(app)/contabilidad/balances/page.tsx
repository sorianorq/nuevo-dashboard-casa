import type { Metadata } from "next";
import { Suspense } from "react";
import { Link2, PenLine, TriangleAlert } from "lucide-react";
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
      <PageHeader eyebrow="Contabilidad" title="Balances" />
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

  const data = await getBalance(ctx, ym.year, monthsElapsed);
  const personal = ctx.tab === "personal";

  const base: Record<string, string> = {};
  if (personal) base.balance = "personal";
  const withView: Record<string, string> = { ...base, ...(view !== "real" ? { vista: view } : {}) };
  const viewHref = (v: BalanceView) => {
    const qs = new URLSearchParams(base);
    if (requested) qs.set("mes", str(sp.mes) as string);
    if (v !== "real") qs.set("vista", v);
    const s = qs.toString();
    return s ? `${PATH}?${s}` : PATH;
  };

  const empty = data.blocks.every((b) => b.rows.length === 0);

  return (
    <>
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
        <p className="rounded-card border bg-card px-6 py-10 text-center text-muted-foreground">
          Este Balance aún no tiene conceptos.
        </p>
      ) : (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Link2 className="size-3.5 text-brand" aria-hidden /> dato automático
            </span>
            <span className="inline-flex items-center gap-1">
              <PenLine className="size-3.5 text-brand" aria-hidden /> escrito a mano
            </span>
            {view === "real" && <span className="lg:hidden">importe gris = presupuesto</span>}
            <span className="hidden lg:inline">Cifras redondeadas al euro: pasa el ratón para ver los céntimos.</span>
            {view === "real" && (
              <span className="hidden lg:inline">Clic en un importe automático para ver sus movimientos.</span>
            )}
          </p>
          <div className="lg:hidden">
            <BalanceMonthList sheet={data} year={ym.year} month={ym.month} view={view} personal={personal} />
          </div>
          <div className="hidden lg:block">
            <BalanceTable
              sheet={data}
              year={ym.year}
              view={view}
              currentMonth={ym.year === currentYm.year ? currentYm.month : null}
              personal={personal}
            />
          </div>
        </>
      )}
    </>
  );
}
