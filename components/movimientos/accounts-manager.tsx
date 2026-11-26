"use client";

import { useState, useTransition } from "react";
import { Landmark, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionIcon } from "@/components/resumen/stat-card";
import { OWNER_LABEL, type Owner, type Person } from "@/lib/balance";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/labels";
import { addAccount, removeAccount } from "@/app/(app)/movimientos/actions";

type Row = { id: string; name: string; bank: string | null; owner: Owner; movements: number };

const selectClass = "h-11 w-full min-w-0 rounded-xl border bg-surface px-3 text-sm hover:bg-accent";

/** Cuentas de Casa y de la persona: añadir y quitar (solo las que no tienen movimientos). */
export function AccountsManager({ accounts, person, banks }: { accounts: Row[]; person: Person; banks: Record<string, string> }) {
  const owners: Owner[] = ["casa", person];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Las cuentas son a las que se cargan los movimientos (extractos o banco). Al quitar una cuenta, sus movimientos no
        se borran: pasan a otra cuenta del mismo Balance o a la «Cuenta Raw», y los Balances no cambian.
      </p>
      {owners.map((owner) => (
        <OwnerAccounts key={owner} owner={owner} rows={accounts.filter((a) => a.owner === owner)} banks={banks} />
      ))}
    </div>
  );
}

function OwnerAccounts({ owner, rows, banks }: { owner: Owner; rows: Row[]; banks: Record<string, string> }) {
  const [adding, setAdding] = useState(false);
  // Cuenta con movimientos que se está quitando (se elige adónde van).
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = `acc-${owner}`;

  const remove = (r: Row, target = "raw") => {
    if (r.movements === 0 && !window.confirm(`¿Quitar la cuenta «${r.name}»?${banks[r.id] ? " También se quitará su conexión con el banco." : ""}`)) return;
    start(async () => {
      const res = await removeAccount(r.id, target);
      if (!res.ok) return void toast.error(res.error);
      setRemoving(null);
      toast.success(
        res.moved > 0
          ? `Cuenta «${r.name}» quitada. Sus ${res.moved.toLocaleString("es-ES")} movimientos están ahora en «${res.movedTo}».`
          : `Cuenta «${r.name}» quitada.`,
      );
    });
  };

  return (
    <section aria-labelledby={id} className="fc-float p-4 lg:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2 text-base font-bold">
          <SectionIcon icon={Wallet} />
          {OWNER_LABEL[owner]}
        </h2>
        {!adding && (
          <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Añadir
          </Button>
        )}
      </div>
      {adding && <NewAccountForm owner={owner} onDone={() => setAdding(false)} />}
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Sin cuentas.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex min-h-10 items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.name}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {r.bank && <span>{r.bank}</span>}
                  <span className="tabular-nums">{r.movements === 1 ? "1 movimiento" : `${r.movements.toLocaleString("es-ES")} movimientos`}</span>
                  {banks[r.id] && (
                    <span className="inline-flex items-center gap-1 text-positive">
                      <Landmark className="size-3" aria-hidden />
                      Conectada con {banks[r.id]}
                    </span>
                  )}
                </span>
              </span>
              {removing !== r.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-lg text-warning"
                  disabled={pending}
                  onClick={() => (r.movements === 0 ? remove(r) : setRemoving(r.id))}
                >
                  <Trash2 aria-hidden /> Quitar
                </Button>
              )}
              </div>
              {removing === r.id && (
                <MoveMovements
                  row={r}
                  others={rows.filter((o) => o.id !== r.id)}
                  bankLinked={Boolean(banks[r.id])}
                  pending={pending}
                  onCancel={() => setRemoving(null)}
                  onConfirm={(target) => remove(r, target)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const isRaw = (name: string) => name.trim().toLowerCase() === "cuenta raw";

/** Al quitar una cuenta con movimientos: a qué cuenta del mismo Balance pasan. */
function MoveMovements({
  row,
  others,
  bankLinked,
  pending,
  onCancel,
  onConfirm,
}: {
  row: Row;
  others: Row[];
  bankLinked: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (target: string) => void;
}) {
  const rawExisting = others.find((o) => isRaw(o.name));
  // La «Cuenta Raw» no puede mandar sus movimientos a sí misma.
  const offerRaw = !isRaw(row.name);
  const [target, setTarget] = useState(offerRaw ? "raw" : (others[0]?.id ?? ""));
  const n = row.movements.toLocaleString("es-ES");
  return (
    <div className="mt-2 space-y-3 rounded-2xl border bg-surface p-3">
      <p className="text-sm">
        «{row.name}» tiene <span className="font-bold tabular-nums">{n}</span> {row.movements === 1 ? "movimiento" : "movimientos"}. No se
        borran: ¿a qué cuenta pasan?
      </p>
      <select aria-label={`Cuenta a la que pasan los movimientos de ${row.name}`} className={selectClass} value={target} onChange={(e) => setTarget(e.target.value)}>
        {offerRaw && <option value="raw">Cuenta Raw{rawExisting ? "" : " (se crea ahora)"}</option>}
        {others
          .filter((o) => !(offerRaw && isRaw(o.name)))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.bank ? ` · ${o.bank}` : ""}
            </option>
          ))}
      </select>
      {bankLinked && <p className="text-xs text-muted-foreground">También se quitará su conexión con el banco.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" variant="destructive" disabled={pending || !target} onClick={() => onConfirm(target)}>
          {pending ? "Pasando movimientos…" : `Pasar ${n} y quitar la cuenta`}
        </Button>
      </div>
    </div>
  );
}

function NewAccountForm({ owner, onDone }: { owner: Owner; onDone: () => void }) {
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [type, setType] = useState<AccountType>("personal");
  const [pending, start] = useTransition();
  return (
    <form
      className="mb-3 grid gap-2 rounded-2xl border bg-surface p-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addAccount(owner === "casa" ? "casa" : "personal", { name, bank, accountType: type });
          if (!res.ok) return void toast.error(res.error);
          toast.success(`Cuenta «${res.account.name}» creada.`);
          onDone();
        });
      }}
    >
      <Input aria-label="Nombre de la cuenta" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
      <Input aria-label="Banco" placeholder="Banco" value={bank} onChange={(e) => setBank(e.target.value)} maxLength={80} />
      <select aria-label="Tipo de cuenta" className={selectClass} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
        {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => (
          <option key={t} value={t}>
            {ACCOUNT_TYPES[t]}
          </option>
        ))}
      </select>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Creando…" : "Crear cuenta"}
        </Button>
      </div>
    </form>
  );
}
