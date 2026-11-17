import type { Metadata } from "next";
import { Suspense } from "react";
import { BalanceComingSoon } from "@/components/layout/balance-coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";

export const metadata: Metadata = { title: "Resumen" };

export default function Page(props: PageProps<"/resumen">) {
  return (
    <>
      <PageHeader eyebrow="Resumen" title="Resumen" />
      <Suspense fallback={<PageSkeleton />}>
        <BalanceComingSoon searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
