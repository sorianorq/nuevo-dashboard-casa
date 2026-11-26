import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { AccountsManager } from "@/components/movimientos/accounts-manager";
import { getDataContext, listAccountsWithCounts, listBankConnections } from "@/lib/data";
import { bankConfigured } from "@/lib/banking/enable-banking";

export const metadata: Metadata = { title: "Cuentas" };

export default function CuentasPage() {
  return (
    <>
      <PageHeader title="Cuentas" />
      <Link
        href="/movimientos/extractos"
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Extractos
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const ctx = await getDataContext();
  const accounts = await listAccountsWithCounts(ctx);
  // Bancos con los que está conectada cada cuenta (solo las conexiones propias).
  const banks: Record<string, string> = {};
  if (bankConfigured()) {
    try {
      const { sessions, links } = await listBankConnections(ctx);
      for (const l of links) {
        const s = sessions.find((x) => x.id === l.sessionId);
        if (s) banks[l.accountId] = s.aspsp;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <AccountsManager accounts={accounts} person={ctx.person} banks={banks} />
    </div>
  );
}
