import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Upload } from "lucide-react";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ConceptChangeProvider } from "@/components/movimientos/concept-change";
import { ConceptsProvider } from "@/components/movimientos/concepts-context";
import { MovementFilters } from "@/components/movimientos/filters";
import { MovementsList } from "@/components/movimientos/movements-list";
import { MonthNav } from "@/components/resumen/month-nav";
import { buttonVariants } from "@/components/ui/button";
import {
  countWithoutConcept,
  getDataContext,
  listAccounts,
  listConcepts,
  listTransactions,
  type TxType,
} from "@/lib/data";
import { formatAmount } from "@/lib/format";
import { compareYm, parseYm, todayIso, ymOf } from "@/lib/months";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Movimientos" };

type SP = PageProps<"/contabilidad/movimientos">["searchParams"];

export default function MovimientosPage(props: PageProps<"/contabilidad/movimientos">) {
  return (
    <>
      <PageHeader eyebrow="Contabilidad" title="Movimientos" />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await getDataContext(sp);

  const currentYm = ymOf(todayIso());
  const requested = parseYm(str(sp.mes));
  const ym = requested && compareYm(requested, currentYm) <= 0 ? requested : currentYm;

  const [accounts, concepts, missing] = await Promise.all([
    listAccounts(ctx, ctx.owner),
    listConcepts(ctx, ctx.owner),
    countWithoutConcept(ctx),
  ]);

  // Filtros validados contra lo que el Balance puede ver.
  const cuenta = accounts.some((a) => a.id === str(sp.cuenta)) ? str(sp.cuenta) : undefined;
  const conceptParam = str(sp.concepto);
  const concepto = conceptParam === "sin" || concepts.some((c) => c.id === conceptParam) ? conceptParam : undefined;
  const tipoParam = str(sp.tipo);
  const tipo = (["ingreso", "gasto", "no-cuenta"] as const).includes(tipoParam as TxType) ? (tipoParam as TxType) : undefined;
  const q = str(sp.q)?.slice(0, 100);

  const rows = await listTransactions(ctx, { ym, accountId: cuenta, concept: concepto, type: tipo, q });
  const counted = rows.filter((r) => r.flow === "normal");
  const income = counted.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const expenses = counted.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);

  const keep: Record<string, string> = {};
  for (const [k, v] of Object.entries({ balance: str(sp.balance), cuenta, concepto, tipo, q })) if (v) keep[k] = v;
  const balanceQs = ctx.tab === "personal" ? "?balance=personal" : "";

  return (
    <ConceptsProvider tab={ctx.tab} initial={concepts}>
      <ConceptChangeProvider>
        <BalanceSwitcher
          role={ctx.role}
          person={ctx.person}
          tab={ctx.tab}
          aside={<MonthNav ym={ym} maxYm={currentYm} pathname="/contabilidad/movimientos" params={keep} />}
        />

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {missing > 0 ? (
            <Link
              href={`/contabilidad/movimientos/revisar${balanceQs}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-soft px-4 text-sm font-semibold hover:bg-accent"
            >
              <AlertTriangle className="size-4 text-warning" aria-hidden />
              <span>
                {missing === 1 ? "1 sin concepto" : `${missing} sin concepto`} ·{" "}
                <span className="text-brand underline-offset-2 hover:underline">Revisar</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          <Link
            href={`/contabilidad/movimientos/cargar${balanceQs}`}
            className={cn(buttonVariants(), "w-full sm:w-auto")}
          >
            <Upload aria-hidden />
            Cargar extracto
          </Link>
        </div>

        <div className="mb-4">
          <MovementFilters accounts={accounts} concepts={concepts} />
        </div>

        <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground" aria-live="polite">
          <span>
            <span className="font-bold text-foreground">{rows.length}</span> movimientos
          </span>
          <span>
            Ingresos <span className="font-bold text-positive tabular-nums">+{formatAmount(income)}</span>
          </span>
          <span>
            Gastos <span className="font-bold text-foreground tabular-nums">{formatAmount(-expenses)}</span>
          </span>
        </p>

        <MovementsList rows={rows} accounts={accounts} />
      </ConceptChangeProvider>
    </ConceptsProvider>
  );
}
