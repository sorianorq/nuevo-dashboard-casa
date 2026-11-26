"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Landmark, Link2, TriangleAlert, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionIcon } from "@/components/resumen/stat-card";
import { formatDate } from "@/lib/format";
import { OWNER_LABEL, type Owner } from "@/lib/balance";
import { connectBank, disconnectBank, linkBankAccount } from "@/app/(app)/movimientos/bancos/actions";

type Bank = { name: string; country: string; maxDays: number | null; beta: boolean };
type Session = {
  id: string;
  aspsp: string;
  validUntil: string | null;
  expired: boolean;
  accounts: { uid: string; name: string; last4: string | null; currency: string | null }[];
};
type Link = { accountId: string; sessionId: string; ebAccountUid: string; lastSyncedAt: string | null };
type AppAccount = { id: string; name: string; bank: string | null; owner: Owner };

const selectClass = "h-11 w-full min-w-0 rounded-xl border bg-surface px-3 text-sm hover:bg-accent";

/** Conectar bancos y decir qué cuenta del banco es cada cuenta de la app. */
export function BankConnections({
  banks,
  banksError,
  sessions,
  links,
  accounts,
  error,
  justConnected,
}: {
  banks: Bank[];
  banksError: string | null;
  sessions: Session[];
  links: Link[];
  accounts: AppAccount[];
  error: string | null;
  justConnected: string | null;
}) {
  const [bank, setBank] = useState("");
  const [pending, start] = useTransition();

  const connect = () =>
    start(async () => {
      const res = await connectBank(bank);
      if (!res.ok) return void toast.error(res.error);
      window.location.assign(res.url);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conecta tu banco para traer los movimientos con un botón en <span className="font-semibold text-foreground">Extractos</span>,
        sin descargar archivos. Es solo lectura: la app no puede mover dinero. El permiso lo das tú en la web de tu banco y dura
        hasta 180 días; después se renueva aquí.
      </p>

      {error && (
        <p role="alert" className="flex gap-2 rounded-card border border-warning/40 bg-card p-4 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          {error}
        </p>
      )}

      <section aria-labelledby="bank-new" className="fc-float p-4 lg:p-5">
        <h2 id="bank-new" className="mb-3 flex items-center gap-2 text-base font-bold">
          <SectionIcon icon={Landmark} />
          Conectar un banco
        </h2>
        {banksError ? (
          <p className="text-sm text-warning">{banksError}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="bank-pick" className="text-xs font-bold text-muted-foreground">
                Banco
              </label>
              <select id="bank-pick" className={selectClass} value={bank} onChange={(e) => setBank(e.target.value)}>
                <option value="">Elige tu banco…</option>
                {banks.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                    {b.beta ? " (en pruebas)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button size="lg" disabled={!bank || pending} onClick={connect}>
              {pending ? "Abriendo el banco…" : "Ir al banco"}
            </Button>
          </div>
        )}
      </section>

      {sessions.length === 0 ? (
        <p className="fc-float px-6 py-10 text-center text-muted-foreground">Todavía no hay ningún banco conectado.</p>
      ) : (
        sessions.map((s) => (
          <SessionCard key={s.id} session={s} links={links} accounts={accounts} highlight={s.id === justConnected} />
        ))
      )}
    </div>
  );
}

function SessionCard({
  session,
  links,
  accounts,
  highlight,
}: {
  session: Session;
  links: Link[];
  accounts: AppAccount[];
  highlight: boolean;
}) {
  const [pending, start] = useTransition();
  const linkOf = (uid: string) => links.find((l) => l.sessionId === session.id && l.ebAccountUid === uid);
  // Cuentas de la app ya enlazadas con otra cuenta del banco.
  const taken = new Set(links.map((l) => l.accountId));

  const choose = (uid: string, accountId: string) =>
    start(async () => {
      const res = await linkBankAccount(session.id, uid, accountId || null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(accountId ? "Cuenta conectada." : "Cuenta desconectada.");
    });

  const remove = () => {
    if (!window.confirm(`¿Quitar la conexión con ${session.aspsp}? Los movimientos ya traídos se quedan.`)) return;
    start(async () => {
      const res = await disconnectBank(session.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Conexión quitada.");
    });
  };

  return (
    <section aria-label={session.aspsp} className="fc-float p-4 lg:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <SectionIcon icon={session.expired ? TriangleAlert : CheckCircle2} tone={session.expired ? "var(--warning)" : "var(--positive)"} />
            {session.aspsp}
          </h2>
          <p className="text-xs text-muted-foreground">
            {session.expired
              ? "El permiso ha caducado: quita la conexión y vuelve a conectar el banco."
              : session.validUntil
                ? `Permiso hasta el ${formatDate(session.validUntil.slice(0, 10))}`
                : "Permiso activo"}
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 rounded-lg" disabled={pending} onClick={remove}>
          <Unplug aria-hidden /> Quitar
        </Button>
      </div>
      {highlight && (
        <p className="mb-3 rounded-xl bg-brand-soft p-3 text-sm">
          Banco conectado. Ahora di qué cuenta de la app es cada cuenta del banco.
        </p>
      )}
      {session.accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">El banco no ha dejado ver ninguna cuenta.</p>
      ) : (
        <ul className="divide-y">
          {session.accounts.map((a) => {
            const link = linkOf(a.uid);
            return (
              <li key={a.uid} className="grid gap-2 py-3 sm:grid-cols-[1fr_16rem] sm:items-center">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {link && <Link2 className="size-3.5 shrink-0 text-positive" aria-label="Conectada" role="img" />}
                    {a.name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {a.last4 ? `···· ${a.last4}` : "Sin número"}
                    {link?.lastSyncedAt ? ` · última vez traída el ${formatDate(link.lastSyncedAt.slice(0, 10))}` : ""}
                  </p>
                </div>
                <select
                  aria-label={`Cuenta de la app para ${a.name}`}
                  className={selectClass}
                  disabled={pending || session.expired}
                  value={link?.accountId ?? ""}
                  onChange={(e) => choose(a.uid, e.target.value)}
                >
                  <option value="">No usar</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} disabled={taken.has(acc.id) && link?.accountId !== acc.id}>
                      {acc.name}
                      {acc.bank ? ` · ${acc.bank}` : ""} ({OWNER_LABEL[acc.owner]})
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Mientras falten las claves de Enable Banking en el servidor. */
export function BankSetupNeeded() {
  return (
    <section className="fc-float mx-auto max-w-3xl space-y-2 p-5 text-sm">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <SectionIcon icon={Landmark} />
        Falta configurar Enable Banking
      </h2>
      <p className="text-muted-foreground">
        Para conectar bancos hacen falta el identificador de la aplicación de Enable Banking y su clave privada en el servidor
        (ENABLE_BANKING_APP_ID y ENABLE_BANKING_PRIVATE_KEY). Mientras tanto, los movimientos se siguen cargando con extractos.
      </p>
    </section>
  );
}
