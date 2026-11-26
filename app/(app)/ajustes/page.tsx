import type { Metadata } from "next";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/data";
import { ROLE_LABEL, allowedOwners, OWNER_LABEL } from "@/lib/balance";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "Ajustes" };

export default function AjustesPage() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <Suspense fallback={<PageSkeleton />}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const session = await getSession();
  return (
    <div className="max-w-lg fc-float">
      <dl className="divide-y">
        <Row label="Usuario" value={session.email} />
        <Row label="Rol" value={ROLE_LABEL[session.role]} />
        <Row
          label="Balances visibles"
          value={allowedOwners(session.role).map((o) => OWNER_LABEL[o]).join(" · ")}
        />
      </dl>
      <form action={signOut} className="border-t p-5">
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          <LogOut aria-hidden />
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  );
}
