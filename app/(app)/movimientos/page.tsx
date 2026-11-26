import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Upload } from "lucide-react";
import { BalanceSwitcher } from "@/components/layout/balance-switcher";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { SegmentedLinks } from "@/components/layout/segmented";
import { ConceptChangeProvider } from "@/components/movimientos/concept-change";
import { ConceptsProvider } from "@/components/movimientos/concepts-context";
import { MovementFilters } from "@/components/movimientos/filters";
import { MovementsList } from "@/components/movimientos/movements-list";
import { AmexView } from "@/components/pagos/amex-view";
import { MonthNav } from "@/components/resumen/month-nav";
import { buttonVariants } from "@/components/ui/button";
import {
  countWithoutConcept,
  getAmex,
  getDataContext,
  getQuickAddData,
  listAccounts,
  listConcepts,
  listManualPayments,
  listTransactions,
  type DataContext,
  type TxType,
} from "@/lib/data";
import { OWNER_LABEL } from "@/lib/balance";
import { MANUAL_ACCOUNT } from "@/lib/labels";
import { formatAmount, formatMonth } from "@/lib/format";
import { compareYm, parseYm, todayIso, ymKey, ymOf, type YearMonth } from "@/lib/months";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Movimientos" };

const PATH = "/movimientos";

type SP = Awaited<PageProps<"/movimientos">["searchParams"]>;

/**
 * Movimientos: pestañas Casa · <persona> · Amex y botón Extractos.
 * Casa y la persona mezclan los movimientos del banco con los gastos
 * apuntados a mano; Amex es la lista de la American Express.
 */
export default function MovimientosPage(props: PageProps<"/movimientos">) {
  return (
    <>
      <PageHeader
        title="Movimientos"
        actions={
          <Link href="/movimientos/extractos" className={cn(buttonVariants(), "h-11 rounded-xl px-4")}>
            <Upload aria-hidden />
            Extractos
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: PageProps<"/movimientos">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await getDataContext(sp);
  const today = todayIso();
  const currentYm = ymOf(today);
  const requested = parseYm(str(sp.mes));
  const ym = requested && compareYm(requested, currentYm) <= 0 ? requested : currentYm;
  const amex = str(sp.ver) === "amex";

  // Pestañas: el mes elegido se conserva al cambiar.
  const mes = requested && compareYm(ym, currentYm) !== 0 ? ymKey(ym) : undefined;
  const href = (params: Record<string, string>) => {
    const q = new URLSearchParams(params);
    if (mes) q.set("mes", mes);
    const s = q.toString();
    return s ? `${PATH}?${s}` : PATH;
  };
  const tabs = (
    <SegmentedLinks
      label="Ver movimientos de"
      className="mx-auto w-full max-w-md lg:mx-0"
      items={[
        { label: OWNER_LABEL.casa, href: href({}), active: !amex && ctx.tab === "casa" },
        { label: OWNER_LABEL[ctx.person], href: href({ balance: "personal" }), active: !amex && ctx.tab === "personal" },
        { label: "Amex", href: href({ ver: "amex" }), active: amex },
      ]}
    />
  );

  return (
    <>
      {ctx.role === "admin" && <BalanceSwitcher role={ctx.role} person={ctx.person} tab={ctx.tab} showTabs={false} className="mb-3 lg:mb-3" />}
      {amex ? (
        <AmexTab ctx={ctx} ym={ym} currentYm={currentYm} today={today} tabs={tabs} />
      ) : (
        <BalanceTab ctx={ctx} sp={sp} ym={ym} currentYm={currentYm} today={today} tabs={tabs} />
      )}
    </>
  );
}

type TabProps = { ctx: DataContext; ym: YearMonth; currentYm: YearMonth; today: string; tabs: React.ReactNode };

async function AmexTab({ ctx, ym, currentYm, today, tabs }: TabProps) {
  const { concepts, conceptsComplete, history, ...data } = await getAmex(ym);
  return (
    <>
      <div className="mb-5 lg:mb-6">{tabs}</div>
      <AmexView
        data={data}
        monthLabel={formatMonth(ym.year, ym.month)}
        monthNav={<MonthNav ym={ym} maxYm={currentYm} pathname={PATH} params={{ ver: "amex" }} />}
        concepts={concepts}
        conceptsComplete={conceptsComplete}
        history={history}
        me={ctx.person}
        visibleOwners={ctx.allowedOwners}
        today={today}
      />
    </>
  );
}

async function BalanceTab({ ctx, sp, ym, currentYm, today, tabs }: TabProps & { sp: SP }) {
  const [accounts, concepts, missing, form] = await Promise.all([
    listAccounts(ctx, ctx.owner),
    listConcepts(ctx, ctx.owner),
    countWithoutConcept(ctx),
    getQuickAddData(ctx),
  ]);

  // Filtros validados contra lo que el Balance puede ver.
  const cuentaParam = str(sp.cuenta);
  const cuenta = cuentaParam === MANUAL_ACCOUNT || accounts.some((a) => a.id === cuentaParam) ? cuentaParam : undefined;
  const conceptParam = str(sp.concepto);
  const concepto = conceptParam === "sin" || concepts.some((c) => c.id === conceptParam) ? conceptParam : undefined;
  const tipoParam = str(sp.tipo);
  const tipo = (["ingreso", "gasto", "no-cuenta"] as const).includes(tipoParam as TxType) ? (tipoParam as TxType) : undefined;
  const q = str(sp.q)?.slice(0, 100);

  const onlyManual = cuenta === MANUAL_ACCOUNT;
  // Los gastos a mano son siempre gastos que cuentan, sin cuenta del banco.
  const withManual = (!cuenta || onlyManual) && tipo !== "ingreso" && tipo !== "no-cuenta";
  const [rows, allManual] = await Promise.all([
    onlyManual ? Promise.resolve([]) : listTransactions(ctx, { ym, accountId: cuenta, concept: concepto, type: tipo, q }),
    withManual ? listManualPayments(ctx, ym, ctx.owner) : Promise.resolve([]),
  ]);
  const needle = q?.trim().toLowerCase();
  const manual = allManual.filter(
    ({ payment: p }) =>
      (!concepto || (concepto === "sin" ? p.conceptId === null : p.conceptId === concepto)) &&
      (!needle || p.description.toLowerCase().includes(needle) || (p.comment ?? "").toLowerCase().includes(needle)),
  );

  const counted = rows.filter((r) => r.flow === "normal");
  const income = counted.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const expenses =
    counted.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0) + manual.reduce((s, m) => s + m.payment.amount, 0);

  const keep: Record<string, string> = {};
  for (const [k, v] of Object.entries({ balance: str(sp.balance), cuenta, concepto, tipo, q })) if (v) keep[k] = v;
  const balanceQs = ctx.tab === "personal" ? "?balance=personal" : "";
  const total = rows.length + manual.length;

  return (
    <ConceptsProvider tab={ctx.tab} initial={concepts}>
      <ConceptChangeProvider>
        <div className="mb-5 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-center lg:justify-between">
          {tabs}
          <MonthNav ym={ym} maxYm={currentYm} pathname={PATH} params={keep} />
        </div>

        {missing > 0 && (
          <Link
            href={`/movimientos/revisar${balanceQs}`}
            className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-soft px-4 text-sm font-semibold hover:bg-accent"
          >
            <AlertTriangle className="size-4 text-warning" aria-hidden />
            <span>
              {missing === 1 ? "1 del banco sin concepto" : `${missing} del banco sin concepto`} ·{" "}
              <span className="text-brand underline-offset-2 hover:underline">Revisar</span>
            </span>
          </Link>
        )}

        <div className="mb-4">
          <MovementFilters accounts={accounts} concepts={concepts} />
        </div>

        <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground" aria-live="polite">
          <span>
            <span className="font-bold text-foreground">{total}</span> movimientos
            {manual.length > 0 && ` (${manual.length} a mano)`}
          </span>
          <span>
            Ingresos <span className="font-bold text-positive tabular-nums">+{formatAmount(income)}</span>
          </span>
          <span>
            Gastos <span className="font-bold text-foreground tabular-nums">{formatAmount(-expenses)}</span>
          </span>
        </p>

        <MovementsList rows={rows} accounts={accounts} manual={manual} form={{ ...form, today }} />
      </ConceptChangeProvider>
    </ConceptsProvider>
  );
}
