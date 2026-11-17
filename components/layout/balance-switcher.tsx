"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  OWNER_LABEL,
  PEOPLE,
  type BalanceTab,
  type Person,
  type Role,
} from "@/lib/balance";
import { setAdminPerson } from "@/app/(app)/actions";
import { SegmentedLinks } from "./segmented";

/**
 * Pestañas de Balance [Casa | <persona>] y, para admin, el selector centrado
 * «Admin · ver datos de: Andrea | Ricardo» (especificación, apartado 2).
 *
 * Solo cambia la vista: el servidor vuelve a validar Balance y rol.
 */
export function BalanceSwitcher({
  role,
  person,
  tab,
  showAdminSelector = true,
  showTabs = true,
  aside,
  className,
}: {
  role: Role;
  person: Person;
  tab: BalanceTab;
  showAdminSelector?: boolean;
  /** false en secciones solo personales (Pagos): sin pestaña Casa. */
  showTabs?: boolean;
  /** Controles a la derecha de las pestañas (p. ej. selector de mes). */
  aside?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (next: BalanceTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "casa") params.delete("balance");
    else params.set("balance", next);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const adminSelector = role === "admin" && showAdminSelector;
  if (!showTabs && !adminSelector && !aside) return null;

  return (
    <div className={cn("mb-5 space-y-3 lg:mb-6", className)}>
      {adminSelector && <AdminPersonSelector person={person} />}
      {(showTabs || aside) && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {showTabs && (
            <SegmentedLinks
              label="Balance"
              className="mx-auto w-full max-w-md lg:mx-0"
              items={[
                { label: OWNER_LABEL.casa, href: hrefFor("casa"), active: tab === "casa" },
                {
                  label: OWNER_LABEL[person],
                  href: hrefFor("personal"),
                  active: tab === "personal",
                },
              ]}
            />
          )}
          {aside}
        </div>
      )}
    </div>
  );
}

function AdminPersonSelector({ person }: { person: Person }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex justify-center">
      <div
        role="group"
        aria-label="Admin · ver datos de"
        aria-busy={pending}
        className="inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl border bg-surface px-3 py-1.5"
      >
        <span className="text-xs font-semibold text-muted-foreground">
          <span className="font-bold text-brand">Admin</span> · ver datos de:
        </span>
        <div className="flex gap-1 rounded-xl bg-track p-1">
          {PEOPLE.map((p) => {
            const active = p === person;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await setAdminPerson(p);
                    router.refresh();
                  })
                }
                className={cn(
                  "min-h-11 rounded-lg px-4 text-sm transition-colors disabled:opacity-60",
                  active
                    ? "bg-surface font-bold text-foreground shadow-sm"
                    : "font-semibold text-muted-foreground hover:text-foreground",
                )}
              >
                {OWNER_LABEL[p]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
