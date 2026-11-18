import type { Metadata } from "next";
import { Suspense } from "react";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { MonthNav } from "@/components/resumen/month-nav";
import { PersonalView } from "@/components/pagos/personal-view";
import { getDataContext, getPersonalPayments } from "@/lib/data";
import { OWNER_LABEL } from "@/lib/balance";
import { formatMonth } from "@/lib/format";
import { compareYm, parseYm, todayIso, ymOf } from "@/lib/months";

export const metadata: Metadata = { title: "Pagos" };

const PATH = "/pagos/personales";

/** Pagos de la persona de la sesión (admin: la elegida en el selector). */
export default function Page(props: PageProps<"/pagos/personales">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow="Pagos" title="Pagos" />
          <PageSkeleton />
        </>
      }
    >
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/pagos/personales">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await getDataContext();
  const today = todayIso();
  const currentYm = ymOf(today);
  const requested = parseYm(typeof sp.mes === "string" ? sp.mes : undefined);
  const ym = requested && compareYm(requested, currentYm) <= 0 ? requested : currentYm;

  const { concepts, conceptsComplete, history, ...data } = await getPersonalPayments(ctx, ym);

  return (
    <>
      <PageHeader eyebrow="Pagos" title={OWNER_LABEL[ctx.person]} />
      <BalanceSwitcher role={ctx.role} person={ctx.person} tab="personal" showTabs={false} />
      <PersonalView
        data={data}
        monthLabel={formatMonth(ym.year, ym.month)}
        monthNav={<MonthNav ym={ym} maxYm={currentYm} pathname={PATH} params={{}} />}
        concepts={concepts}
        conceptsComplete={conceptsComplete}
        history={history}
        me={ctx.person}
        visibleOwners={ctx.allowedOwners}
        today={today}
      />
    </>
  );
}
