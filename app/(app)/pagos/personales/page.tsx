import type { Metadata } from "next";
import { Suspense } from "react";
import { BalanceComingSoon } from "@/components/layout/balance-coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";

export const metadata: Metadata = { title: "Pagos" };

export default function Page(props: PageProps<"/pagos/personales">) {
  return (
    <>
      <PageHeader eyebrow="Pagos" title="Pagos" />
      <Suspense fallback={<PageSkeleton />}>
        <BalanceComingSoon searchParams={props.searchParams} personal />
      </Suspense>
    </>
  );
}
