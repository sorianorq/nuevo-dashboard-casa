import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { FlowEditor } from "@/components/flujo/flow-editor";
import { getFlow } from "@/lib/data";

export const metadata: Metadata = { title: "Flujo de dinero" };

/** Sección compartida: el mismo diagrama para Andrea y Ricardo. */
export default function Page() {
  return (
    <>
      <PageHeader title="Flujo de dinero" />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const flow = await getFlow();
  return <FlowEditor initial={flow} />;
}
