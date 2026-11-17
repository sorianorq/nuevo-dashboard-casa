import { getSession } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/balance";

/** Usuario de la sesión en el pie del menú lateral. */
export async function SidebarUser() {
  const { role, email } = await getSession();
  return (
    <>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-track text-sm font-bold"
      >
        {ROLE_LABEL[role].charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{ROLE_LABEL[role]}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
    </>
  );
}

export function SidebarUserFallback() {
  return (
    <>
      <span aria-hidden className="size-9 shrink-0 rounded-full bg-track" />
      <span aria-hidden className="h-4 w-24 rounded bg-track" />
    </>
  );
}
