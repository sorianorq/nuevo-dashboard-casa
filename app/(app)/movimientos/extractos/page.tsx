import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Landmark, Wallet } from "lucide-react";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ImportWizard, type WizardBalance, type WizardBankLinks } from "@/components/movimientos/import-wizard";
import { getDataContext, listAccounts, listBankConnections, listConcepts } from "@/lib/data";
import { bankConfigured } from "@/lib/banking/enable-banking";
import type { BalanceTab, Owner } from "@/lib/balance";

export const metadata: Metadata = { title: "Extractos" };

type SP = PageProps<"/movimientos/extractos">["searchParams"];

export default function ExtractosPage(props: PageProps<"/movimientos/extractos">) {
  return (
    <>
      <PageHeader title="Extractos" />
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

  // Cuentas conectadas con el banco por este usuario (vacío si aún no se ha configurado).
  const bankLinks: WizardBankLinks = {};
  const bankEnabled = bankConfigured();
  if (bankEnabled) {
    try {
      const { sessions, links } = await listBankConnections(ctx);
      for (const l of links) {
        const s = sessions.find((x) => x.id === l.sessionId);
        if (s) bankLinks[l.accountId] = { aspsp: s.aspsp, active: !s.expired, lastSyncedAt: l.lastSyncedAt };
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <>
      {ctx.role === "admin" && (
        <BalanceSwitcher role={ctx.role} person={ctx.person} tab={ctx.tab} showTabs={false} />
      )}
      <Link
        href={`/movimientos${ctx.tab === "personal" ? "?balance=personal" : ""}`}
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Movimientos
      </Link>
      <Link
        href="/movimientos/cuentas"
        className="mb-3 ml-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
      >
        <Wallet className="size-4" aria-hidden />
        Cuentas
      </Link>
      {bankEnabled && (
        <Link
          href="/movimientos/bancos"
          className="mb-3 ml-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          <Landmark className="size-4" aria-hidden />
          Bancos conectados
        </Link>
      )}
      <div className="mx-auto max-w-5xl">
        <ImportWizard key={ctx.person} balances={balances} initialTab={ctx.tab} bankLinks={bankLinks} />
      </div>
    </>
  );
}
