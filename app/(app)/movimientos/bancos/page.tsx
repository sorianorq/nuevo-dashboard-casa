import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { BankConnections, BankSetupNeeded } from "@/components/movimientos/bank-connections";
import { getDataContext, linkableAccounts, listBankConnections } from "@/lib/data";
import { bankConfigured, listBanks, type Aspsp } from "@/lib/banking/enable-banking";

export const metadata: Metadata = { title: "Bancos" };

const MESSAGES: Record<string, string> = {
  cancelado: "No se ha dado el permiso en el banco. No se ha conectado nada.",
  vuelta: "La vuelta del banco no corresponde a ninguna conexión pendiente. Vuelve a intentarlo.",
  permiso: "El banco no ha dado el permiso. Vuelve a intentarlo.",
  banco: "El banco no ha respondido bien al conectar. Vuelve a intentarlo en un rato.",
};

export default function BancosPage(props: PageProps<"/movimientos/bancos">) {
  return (
    <>
      <PageHeader title="Bancos" />
      <Link
        href="/movimientos/extractos"
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Extractos
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/movimientos/bancos">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await getDataContext();
  if (!bankConfigured()) return <BankSetupNeeded />;

  let connections: Awaited<ReturnType<typeof listBankConnections>>;
  try {
    connections = await listBankConnections(ctx);
  } catch (e) {
    console.error(e);
    return (
      <p role="alert" className="fc-float mx-auto max-w-3xl p-5 text-sm">
        Falta preparar la base de datos para los bancos: ejecuta en Supabase el script{" "}
        <span className="font-semibold">17_bancos_enable_banking.sql</span>.
      </p>
    );
  }
  const accounts = await linkableAccounts(ctx);
  let banks: Aspsp[] = [];
  let banksError: string | null = null;
  try {
    banks = await listBanks("ES");
  } catch (e) {
    console.error(e);
    banksError = "No se ha podido cargar la lista de bancos. Revisa la configuración de Enable Banking.";
  }

  const error = typeof sp.error === "string" ? (MESSAGES[sp.error] ?? MESSAGES.banco) : null;
  const justConnected = typeof sp.conectado === "string" ? sp.conectado : null;

  return (
    <div className="mx-auto max-w-3xl">
      <BankConnections
        banks={banks}
        banksError={banksError}
        sessions={connections.sessions}
        links={connections.links}
        accounts={accounts}
        error={error}
        justConnected={justConnected}
      />
    </div>
  );
}
