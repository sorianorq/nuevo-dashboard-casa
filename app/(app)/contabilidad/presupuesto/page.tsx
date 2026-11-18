import type { Metadata } from "next";
import { Suspense } from "react";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { MonthNav } from "@/components/resumen/month-nav";
import { BudgetView } from "@/components/presupuesto/budget-view";
import { getBudget, getDataContext } from "@/lib/data";
import { formatMonth } from "@/lib/format";
import { addMonths, compareYm, parseYm, todayIso, ymKey, ymOf } from "@/lib/months";

export const metadata: Metadata = { title: "Presupuesto" };

const PATH = "/contabilidad/presupuesto";
type SP = PageProps<"/contabilidad/presupuesto">["searchParams"];

export default function Page(props: PageProps<"/contabilidad/presupuesto">) {
  return (
    <>
      <PageHeader eyebrow="Contabilidad" title="Presupuesto" />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await getDataContext(sp);
  const today = todayIso();
  const currentYm = ymOf(today);
  // Se puede preparar el presupuesto hasta 12 meses por delante.
  const maxYm = addMonths(currentYm, 12);
  const requested = parseYm(typeof sp.mes === "string" ? sp.mes : undefined);
  const ym = requested && compareYm(requested, maxYm) <= 0 ? requested : currentYm;

  const data = await getBudget(ctx, ym, today);
  const params: Record<string, string> = ctx.tab === "personal" ? { balance: "personal" } : {};

  return (
    <>
      <BalanceSwitcher
        role={ctx.role}
        person={ctx.person}
        tab={ctx.tab}
        aside={<MonthNav ym={ym} maxYm={maxYm} defaultYm={currentYm} pathname={PATH} params={params} />}
      />
      <BudgetView tab={ctx.tab} month={ymKey(ym)} monthLabel={formatMonth(ym.year, ym.month)} data={data} />
    </>
  );
}
