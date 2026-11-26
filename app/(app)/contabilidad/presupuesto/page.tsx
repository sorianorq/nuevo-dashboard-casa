import type { Metadata } from "next";
import { Suspense } from "react";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { MonthSelect } from "@/components/resumen/month-select";
import { BudgetView } from "@/components/presupuesto/budget-view";
import { getBudget, getDataContext } from "@/lib/data";
import { formatMonth } from "@/lib/format";
import { compareYm, parseYm, todayIso, ymOf } from "@/lib/months";

export const metadata: Metadata = { title: "Presupuesto" };

const PATH = "/contabilidad/presupuesto";
type SP = PageProps<"/contabilidad/presupuesto">["searchParams"];

export default function Page(props: PageProps<"/contabilidad/presupuesto">) {
  return (
    <>
      <PageHeader title="Presupuesto" />
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
  // El presupuesto es fijo: el mes solo elige qué gasto se compara (desde enero del año pasado).
  const minYm = { year: currentYm.year - 1, month: 1 };
  const requested = parseYm(typeof sp.mes === "string" ? sp.mes : undefined);
  const ym = requested && compareYm(requested, currentYm) <= 0 && compareYm(requested, minYm) >= 0 ? requested : currentYm;

  const data = await getBudget(ctx, ym, today);
  const params: Record<string, string> = ctx.tab === "personal" ? { balance: "personal" } : {};

  return (
    <>
      <BalanceSwitcher
        role={ctx.role}
        person={ctx.person}
        tab={ctx.tab}
        aside={<MonthSelect ym={ym} minYm={minYm} maxYm={currentYm} pathname={PATH} params={params} />}
      />
      <BudgetView tab={ctx.tab} monthLabel={formatMonth(ym.year, ym.month)} data={data} />
    </>
  );
}
