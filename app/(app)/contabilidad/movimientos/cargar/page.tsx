import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ImportWizard, type WizardBalance } from "@/components/movimientos/import-wizard";
import { getDataContext, listAccounts, listConcepts } from "@/lib/data";
import type { BalanceTab, Owner } from "@/lib/balance";

export const metadata: Metadata = { title: "Cargar extracto" };

type SP = PageProps<"/contabilidad/movimientos/cargar">["searchParams"];

export default function CargarPage(props: PageProps<"/contabilidad/movimientos/cargar">) {
  return (
    <>
      <PageHeader eyebrow="Movimientos" title="Cargar extracto" />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await getDataContext(sp);

  // Balances donde se puede importar: Casa y el de la persona (validados).
  const tabs: { tab: BalanceTab; owner: Owner }[] = [
    { tab: "casa", owner: "casa" },
    { tab: "personal", owner: ctx.person },
  ];
  const balances: WizardBalance[] = await Promise.all(
    tabs.map(async ({ tab, owner }) => {
      const [accounts, concepts] = await Promise.all([listAccounts(ctx, owner), listConcepts(ctx, owner)]);
      return { tab, owner, accounts, concepts };
    }),
  );

  return (
    <>
      {ctx.role === "admin" && (
        <BalanceSwitcher role={ctx.role} person={ctx.person} tab={ctx.tab} showTabs={false} />
      )}
      <Link
        href={`/contabilidad/movimientos${ctx.tab === "personal" ? "?balance=personal" : ""}`}
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Movimientos
      </Link>
      <div className="mx-auto max-w-5xl">
        <ImportWizard key={ctx.person} balances={balances} initialTab={ctx.tab} />
      </div>
    </>
  );
}
