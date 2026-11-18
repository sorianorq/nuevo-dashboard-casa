import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ConceptChangeProvider } from "@/components/movimientos/concept-change";
import { ConceptsProvider } from "@/components/movimientos/concepts-context";
import { ReviewCard } from "@/components/movimientos/review-card";
import {
  conceptHistory,
  countWithoutConcept,
  getDataContext,
  listAccounts,
  listConcepts,
  nextWithoutConcept,
} from "@/lib/data";
import { buildSuggester } from "@/lib/import/suggest";

export const metadata: Metadata = { title: "Revisar movimientos" };

type SP = PageProps<"/movimientos/revisar">["searchParams"];

export default function RevisarPage(props: PageProps<"/movimientos/revisar">) {
  return (
    <>
      <PageHeader eyebrow="Movimientos" title="Revisar sin concepto" />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await getDataContext(sp);
  const skip = Math.max(0, Math.min(100000, Number(typeof sp.n === "string" ? sp.n : 0) || 0));
  const balanceQs = ctx.tab === "personal" ? "balance=personal" : "";
  const back = `/movimientos${balanceQs ? `?${balanceQs}` : ""}`;

  const [tx, missing, concepts, accounts, history] = await Promise.all([
    nextWithoutConcept(ctx, skip),
    countWithoutConcept(ctx),
    listConcepts(ctx, ctx.owner),
    listAccounts(ctx, ctx.owner),
    conceptHistory(ctx),
  ]);
  const s = tx ? buildSuggester(history)(tx.description) : null;
  const allowed = new Set(concepts.map((c) => c.id));
  const suggestion = s && allowed.has(s.conceptId) ? { conceptId: s.conceptId, source: s.source } : null;
  const qs = (n: number) => `?${[balanceQs, n ? `n=${n}` : ""].filter(Boolean).join("&")}`;

  return (
    <ConceptsProvider tab={ctx.tab} initial={concepts}>
      <ConceptChangeProvider>
        <BalanceSwitcher role={ctx.role} person={ctx.person} tab={ctx.tab} />
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Link href={back} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
              <ArrowLeft className="size-4" aria-hidden />
              Movimientos
            </Link>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              <span className="font-bold text-foreground tabular-nums">{missing}</span> pendientes
              {skip > 0 && <span> · {skip} saltados</span>}
            </p>
          </div>

          {tx ? (
            <ReviewCard
              key={tx.id}
              tx={tx}
              accountName={accounts.find((a) => a.id === tx.accountId)?.name ?? "Cuenta"}
              suggestion={suggestion}
              skipHref={qs(skip + 1)}
            />
          ) : (
            <div className="rounded-card border bg-card px-6 py-12 text-center">
              <CheckCircle2 className="mx-auto size-10 text-positive" aria-hidden />
              <p className="mt-3 text-[18px] font-extrabold">
                {missing === 0 ? "Todo revisado" : "No quedan más por revisar en esta vuelta"}
              </p>
              {missing > 0 && (
                <Link href={qs(0)} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand hover:underline">
                  Volver a los {missing} saltados
                </Link>
              )}
            </div>
          )}
        </div>
      </ConceptChangeProvider>
    </ConceptsProvider>
  );
}
