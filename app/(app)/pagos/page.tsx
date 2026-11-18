import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { SegmentedLinks } from "@/components/layout/segmented";
import { MonthNav } from "@/components/resumen/month-nav";
import { AmexView } from "@/components/pagos/amex-view";
import { PersonalView } from "@/components/pagos/personal-view";
import { getAmex, getDataContext, getPersonalPayments, type DataContext } from "@/lib/data";
import { isPerson, OWNER_LABEL, type Owner, type Person } from "@/lib/balance";
import { formatMonth } from "@/lib/format";
import { compareYm, parseYm, todayIso, ymKey, ymOf, type YearMonth } from "@/lib/months";

export const metadata: Metadata = { title: "Pagos" };

const PATH = "/pagos";

/** Vistas de Pagos, en este orden. Cada rol ve las de sus Balances y la Amex. */
const VIEWS = ["casa", "ricardo", "andrea", "amex"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { ...OWNER_LABEL, amex: "Amex" };
const VIEW_TITLE: Record<View, string> = { ...OWNER_LABEL, amex: "American Express" };

/**
 * Pagos: una sola pantalla con selector Casa · Ricardo · Andrea · Amex
 * (`?ver=`). Sin `ver`, la persona de la sesión.
 */
export default function Page(props: PageProps<"/pagos">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow="Pagos" title="Pagos" />
          <PageSkeleton />
        </>
      }
    >
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/pagos">["searchParams"] }) {
  const sp = await searchParams;
  // Sesión antes de leer la hora (Cache Components).
  const ctx = await getDataContext();
  const today = todayIso();
  const currentYm = ymOf(today);
  const requested = parseYm(typeof sp.mes === "string" ? sp.mes : undefined);
  const ym = requested && compareYm(requested, currentYm) <= 0 ? requested : currentYm;

  const views = VIEWS.filter((v) => v === "amex" || ctx.allowedOwners.includes(v as Owner));
  const asked = typeof sp.ver === "string" ? sp.ver : undefined;
  const view: View = views.find((v) => v === asked) ?? ctx.person;

  const params: Record<string, string> = view === ctx.person ? {} : { ver: view };
  const href = (v: View) => {
    const q = new URLSearchParams();
    if (v !== ctx.person) q.set("ver", v);
    if (requested && compareYm(ym, currentYm) !== 0) q.set("mes", ymKey(ym));
    const s = q.toString();
    return s ? `${PATH}?${s}` : PATH;
  };

  const monthLabel = formatMonth(ym.year, ym.month);
  const monthNav = <MonthNav ym={ym} maxYm={currentYm} pathname={PATH} params={params} />;
  // Quien apunta: en la vista de una persona, ella (admin puede apuntar por otra); si no, la sesión.
  const me = isPerson(view) ? view : ctx.person;

  return (
    <>
      <PageHeader eyebrow="Pagos" title={VIEW_TITLE[view]} />
      <SegmentedLinks
        label="Ver pagos de"
        className="mb-5 w-full max-w-lg lg:mb-6"
        items={views.map((v) => ({ label: VIEW_LABEL[v], href: href(v), active: v === view }))}
      />
      {view === "amex" ? (
        <AmexContent ym={ym} monthLabel={monthLabel} monthNav={monthNav} me={me} visibleOwners={ctx.allowedOwners} today={today} />
      ) : (
        <PersonalContent ctx={ctx} ym={ym} view={view} me={me} monthLabel={monthLabel} monthNav={monthNav} today={today} />
      )}
    </>
  );
}

type Common = {
  ym: YearMonth;
  monthLabel: string;
  monthNav: React.ReactNode;
  me: Person;
  today: string;
};

async function AmexContent({ ym, visibleOwners, ...rest }: Common & { visibleOwners: Owner[] }) {
  const { concepts, conceptsComplete, history, ...data } = await getAmex(ym);
  return (
    <AmexView
      data={data}
      {...rest}
      concepts={concepts}
      conceptsComplete={conceptsComplete}
      history={history}
      visibleOwners={visibleOwners}
    />
  );
}

async function PersonalContent({
  ctx,
  ym,
  view,
  me,
  ...rest
}: Common & { ctx: DataContext; view: Owner }) {
  const { concepts, conceptsComplete, history, ...data } = await getPersonalPayments(ctx, ym, view, me);
  return (
    <PersonalView
      data={data}
      {...rest}
      concepts={concepts}
      conceptsComplete={conceptsComplete}
      history={history}
      me={me}
      visibleOwners={ctx.allowedOwners}
    />
  );
}
