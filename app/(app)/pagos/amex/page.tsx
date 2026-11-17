import type { Metadata } from "next";
import { Suspense } from "react";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { SessionGate } from "@/components/layout/session-gate";

export const metadata: Metadata = { title: "American Express" };

/** Sección compartida: la ven todos los roles. */
export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Pagos" title="American Express" />
      <Suspense fallback={<PageSkeleton />}>
        <SessionGate>
          <ComingSoon />
        </SessionGate>
      </Suspense>
    </>
  );
}
