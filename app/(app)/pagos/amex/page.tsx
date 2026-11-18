import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { MonthNav } from "@/components/resumen/month-nav";
import { AmexView } from "@/components/pagos/amex-view";
import { getAmex, getDataContext } from "@/lib/data";
import { formatMonth } from "@/lib/format";
import { compareYm, parseYm, todayIso, ymOf } from "@/lib/months";

export const metadata: Metadata = { title: "American Express" };

const PATH = "/pagos/amex";

/** Sección compartida: la ven todos los roles. */
export default function Page(props: PageProps<"/pagos/amex">) {
  return (
    <>
      <PageHeader eyebrow="Pagos" title="American Express" />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/pagos/amex">["searchParams"] }) {
  const sp = await searchParams;
  // Sesión antes de leer la hora (Cache Components).
  const ctx = await getDataContext();
  const today = todayIso();
  const currentYm = ymOf(today);
  const requested = parseYm(typeof sp.mes === "string" ? sp.mes : undefined);
  const ym = requested && compareYm(requested, currentYm) <= 0 ? requested : currentYm;

  const { concepts, conceptsComplete, history, ...data } = await getAmex(ym);

  return (
    <AmexView
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
  );
}
