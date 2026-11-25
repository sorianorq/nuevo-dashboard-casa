import type { Metadata } from "next";
import { Suspense } from "react";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { MonthNav } from "@/components/resumen/month-nav";
import { ResumenSkeleton } from "@/components/resumen/resumen-skeleton";
import { ResumenView } from "@/components/resumen/resumen-view";
import { MobileQuickActions, PurchaseEditor } from "@/components/supermercado/purchase-editor";
import { getDataContext, getSummary, listStores } from "@/lib/data";
import { compareYm, parseYm, todayIso, ymOf } from "@/lib/months";

export const metadata: Metadata = { title: "Resumen" };

export default function ResumenPage(props: PageProps<"/resumen">) {
  return (
    <>
      <PageHeader eyebrow="Resumen" title="Resumen" />
      <Suspense fallback={<ResumenSkeleton />}>
        <ResumenContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function ResumenContent({ searchParams }: { searchParams: PageProps<"/resumen">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await getDataContext(sp);

  const today = todayIso();
  const currentYm = ymOf(today);
  const requested = parseYm(typeof sp.mes === "string" ? sp.mes : undefined);
  // No se permiten meses futuros.
  const ym = requested && compareYm(requested, currentYm) <= 0 ? requested : currentYm;

  const [summary, stores] = await Promise.all([getSummary(ctx, ym, today), listStores()]);

  const params: Record<string, string> = {};
  if (ctx.tab === "personal") params.balance = "personal";

  return (
    // Botones flotantes del móvil: «Gasto» (alta rápida) y «Ticket» (foto y compra nueva).
    <PurchaseEditor stores={stores} today={today} me={ctx.person}>
      <BalanceSwitcher
        role={ctx.role}
        person={ctx.person}
        tab={ctx.tab}
        aside={<MonthNav ym={ym} maxYm={currentYm} pathname="/resumen" params={params} />}
      />
      <ResumenView summary={summary} owner={ctx.owner} />
      <MobileQuickActions />
    </PurchaseEditor>
  );
}
