import { getDataContext } from "@/lib/data";
import { BalanceSwitcher } from "./balance-switcher";
import { ComingSoon } from "./coming-soon";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Pestañas de Balance + «Próximamente», con el Balance validado en el
 * servidor. `personal`: secciones sin pestaña Casa (Pagos personales).
 */
export async function BalanceComingSoon({
  searchParams,
  personal = false,
}: {
  searchParams: SearchParams;
  personal?: boolean;
}) {
  const ctx = await getDataContext(await searchParams);
  return (
    <>
      <BalanceSwitcher
        role={ctx.role}
        person={ctx.person}
        tab={personal ? "personal" : ctx.tab}
        showTabs={!personal}
      />
      <ComingSoon owner={personal ? ctx.person : ctx.owner} />
    </>
  );
}
