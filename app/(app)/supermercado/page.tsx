import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { MonthNav } from "@/components/resumen/month-nav";
import { StatCard } from "@/components/resumen/stat-card";
import { CategoryList, Evolution, StoreList } from "@/components/supermercado/breakdowns";
import { PurchaseHistory } from "@/components/supermercado/purchase-history";
import { getSession, getSupermarket } from "@/lib/data";
import { formatAmount, formatDate, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { compareYm, parseYm, todayIso, ymOf } from "@/lib/months";

export const metadata: Metadata = { title: "Supermercado" };

const PATH = "/supermercado";

/** Sección compartida: la ven todos los roles. */
export default function Page(props: PageProps<"/supermercado">) {
  return (
    <>
      <PageHeader eyebrow="Supermercado" title="Supermercado" />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/supermercado">["searchParams"] }) {
  const sp = await searchParams;
  // Sesión antes de leer la hora: con Cache Components, `new Date()` necesita
  // un acceso dinámico previo (cookies) para calcularse en cada petición.
  await getSession();
  const today = todayIso();
  const currentYm = ymOf(today);
  const requested = parseYm(typeof sp.mes === "string" ? sp.mes : undefined);
  const ym = requested && compareYm(requested, currentYm) <= 0 ? requested : currentYm;

  const data = await getSupermarket(ym, today);
  const s = data.summary;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 lg:mb-6">
        <MonthNav ym={ym} maxYm={currentYm} pathname={PATH} params={{}} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:mb-5 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Gasto del mes"
          value={formatAmount(s.spent)}
          footer={s.isCurrentMonth ? <span className="text-xs text-muted-foreground">Del día 1 a hoy</span> : undefined}
        />
        <StatCard label="Nº de compras" value={String(data.count)} />
        <StatCard label="Ticket medio" value={data.averageTicket === null ? "—" : formatAmount(data.averageTicket)} />
        <StatCard
          label="vs mes anterior"
          value={
            s.vsPrevious === null
              ? "—"
              : `${s.vsPrevious > 0.0005 ? "▲ " : s.vsPrevious < -0.0005 ? "▼ " : ""}${formatSignedPercent(s.vsPrevious)}`
          }
          valueClassName={cn(
            s.vsPrevious !== null && s.vsPrevious > 0.0005 && "text-warning",
            s.vsPrevious !== null && s.vsPrevious < -0.0005 && "text-positive",
          )}
          footer={
            <span className="text-[11px] text-muted-foreground">
              {formatAmount(s.previousComparable)} ·{" "}
              {s.isCurrentMonth ? `hasta el ${formatDate(s.previousCutoff)}` : "mes completo"}
            </span>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <CategoryList categories={data.categories} isCurrentMonth={s.isCurrentMonth} />
        <div className="space-y-4 lg:space-y-5">
          <StoreList stores={data.stores} />
          <Evolution summary={s} />
        </div>
        <div className="lg:col-span-2">
          <PurchaseHistory purchases={data.purchases} />
        </div>
      </div>
    </>
  );
}
