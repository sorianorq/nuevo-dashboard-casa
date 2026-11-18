"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { parseAmount } from "@/components/balances/balance-editor";
import { OWNER_LABEL, type Owner, type Person } from "@/lib/balance";
import {
  isOthersName,
  OTHERS_NAME,
  PAID_BY_LABEL,
  PAYMENT_METHOD_KIND_LABEL,
  PAYMENT_METHOD_KINDS,
  type PagosConcept,
  type PaidBy,
  type Payment,
  type PaymentMethod,
  type PaymentMethodKind,
} from "@/lib/calc/pagos";
import { buildSuggester, type HistoryRow } from "@/lib/import/suggest";
import {
  deletePaymentAction,
  newPaymentMethodAction,
  savePaymentAction,
} from "@/app/(app)/pagos/actions";

export type PaymentFormProps = {
  /**
   * amex: pantalla American Express (siempre con Amex, se elige quién pagó).
   * personal: Pagos de la persona (paga ella; casilla «Pagado con AMEX» o medio de pago).
   */
  mode?: "amex" | "personal";
  /** Solo personal: medios de pago de la persona. */
  methods?: PaymentMethod[];
  /** null = gasto nuevo. */
  payment: Payment | null;
  concepts: PagosConcept[];
  /** false = falta el script 08: no se ven los conceptos del otro. */
  conceptsComplete: boolean;
  history: HistoryRow[];
  /** Persona de la sesión (o la elegida por admin). */
  me: Person;
  /** Balances visibles para el rol. */
  visibleOwners: Owner[];
  /** Balance de un gasto nuevo (por defecto, el de quien pagó). */
  defaultOwner?: Owner;
  today: string;
  /** Tras guardar o borrar. */
  onDone: () => void;
  onCancel?: () => void;
  /** Prefijo de ids (puede haber dos formularios en la página). */
  idPrefix: string;
};

const toInput = (v: number) =>
  v.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });

/**
 * Formulario de gasto de Pagos · American Express: importe, fecha,
 * descripción, pagado por, Balance (Casa o el de quien pagó), concepto
 * (sugerido por gastos parecidos; si no, «Otros gastos»), pendiente y comentario.
 */
export function PaymentForm(props: PaymentFormProps) {
  const {
    payment,
    concepts,
    conceptsComplete,
    history,
    me,
    visibleOwners,
    today,
    onDone,
    onCancel,
    idPrefix,
  } = props;
  const mode = props.mode ?? "amex";
  const personal = mode === "personal";
  const editing = payment !== null;
  const suggest = useMemo(() => buildSuggester(history), [history]);
  const byId = useMemo(
    () => new Map(concepts.map((c) => [c.id, c])),
    [concepts],
  );

  const othersOf = (owner: Owner) =>
    concepts.find(
      (c) => c.owner === owner && !c.archived && isOthersName(c.name),
    )?.id ?? null;
  const defaultOwner = (paidBy: PaidBy): Owner =>
    paidBy === "otros" ? "casa" : paidBy;

  const initialPaidBy: PaidBy = payment?.paidBy ?? me;
  const initialConcept = payment?.conceptId
    ? byId.get(payment.conceptId)
    : undefined;
  const initialOwner: Owner =
    initialConcept?.owner ??
    (!payment && props.defaultOwner ? props.defaultOwner : defaultOwner(initialPaidBy));

  const [amount, setAmount] = useState(payment ? toInput(payment.amount) : "");
  const [date, setDate] = useState(payment?.date ?? today);
  const [description, setDescription] = useState(payment?.description ?? "");
  const [paidBy, setPaidBy] = useState<PaidBy>(initialPaidBy);
  const [owner, setOwner] = useState<Owner>(initialOwner);
  const [conceptId, setConceptId] = useState<string | null>(
    initialConcept ? initialConcept.id : othersOf(initialOwner),
  );
  const [suggested, setSuggested] = useState(false);
  const [conceptTouched, setConceptTouched] = useState(Boolean(initialConcept));
  const [pending, setPending] = useState(
    payment ? payment.pending : initialOwner !== "casa",
  );
  const [pendingTouched, setPendingTouched] = useState(editing);
  const [comment, setComment] = useState(payment?.comment ?? "");
  const [amex, setAmex] = useState(
    personal ? payment?.wallet === "amex" : true,
  );
  const [methods, setMethods] = useState<PaymentMethod[]>(props.methods ?? []);
  const activeMethods = methods.filter(
    (m) => !m.archived || m.id === payment?.paymentMethodId,
  );
  const [methodId, setMethodId] = useState<string | null>(
    payment?.paymentMethodId ??
      (personal ? (activeMethods[0]?.id ?? null) : null),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, start] = useTransition();

  /** Recoloca Balance y concepto tras cambiar descripción, pagador o Balance. */
  const settle = (next: {
    description: string;
    paidBy: PaidBy;
    owner: Owner;
    ownerChosen: boolean;
  }) => {
    let o = next.owner;
    if (!conceptTouched) {
      const s = next.description.trim() ? suggest(next.description) : null;
      const sc = s ? byId.get(s.conceptId) : undefined;
      const fits =
        sc && !sc.archived && (sc.owner === "casa" || sc.owner === next.paidBy);
      if (fits && (!next.ownerChosen || sc.owner === o)) {
        o = sc.owner;
        setConceptId(sc.id);
        setSuggested(true);
      } else {
        setConceptId(othersOf(o));
        setSuggested(false);
      }
    } else if (conceptId && byId.get(conceptId)?.owner !== o) {
      setConceptId(othersOf(o));
      setConceptTouched(false);
      setSuggested(false);
    }
    setOwner(o);
    if (!pendingTouched) setPending(o !== "casa");
  };

  const parsed = parseAmount(amount);
  const amountValid = parsed !== null && !Number.isNaN(parsed) && parsed > 0;
  const options = concepts.filter(
    (c) => c.owner === owner && (!c.archived || c.id === payment?.conceptId),
  );
  const hasOthers = options.some((c) => isOthersName(c.name));
  // Sin «Otros gastos» en un Balance visible: se crea al guardar (conceptId null).
  const canCreateOthers = !hasOthers && visibleOwners.includes(owner);
  const blindOwner = !conceptsComplete && !visibleOwners.includes(owner);
  const conceptOk =
    conceptId !== null
      ? options.some((c) => c.id === conceptId)
      : canCreateOthers;
  const methodOk =
    amex || (methodId !== null && activeMethods.some((m) => m.id === methodId));
  const canSave =
    amountValid &&
    description.trim() !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    conceptOk &&
    methodOk &&
    !busy;

  const save = () =>
    start(async () => {
      if (parsed === null) return;
      const res = await savePaymentAction(payment?.id ?? null, {
        date,
        description,
        amount: parsed,
        amex,
        paidBy,
        owner,
        conceptId,
        paymentMethodId: amex ? null : methodId,
        pending: amex && pending,
        comment,
      });
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success(editing ? "Gasto actualizado" : "Gasto guardado");
        onDone();
      });
    });

  const remove = () =>
    start(async () => {
      if (!payment) return;
      const res = await deletePaymentAction(payment.id);
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success("Gasto borrado");
        onDone();
      });
    });

  const people: PaidBy[] =
    paidBy === "otros" ? ["andrea", "ricardo", "otros"] : ["andrea", "ricardo"];
  const owners: Owner[] = paidBy === "otros" ? ["casa"] : ["casa", paidBy];
  const label = "text-xs font-bold text-muted-foreground";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) save();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-amount`} className={label}>
            Importe
          </label>
          <Input
            id={`${idPrefix}-amount`}
            inputMode="decimal"
            placeholder="0,00 €"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={amount !== "" && !amountValid}
            className="h-11 tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-date`} className={label}>
            Fecha
          </label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={date}
            max="2100-12-31"
            onChange={(e) => setDate(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-desc`} className={label}>
          Descripción
        </label>
        <Input
          id={`${idPrefix}-desc`}
          placeholder="Ej.: Zara, cena, peaje…"
          value={description}
          maxLength={120}
          onChange={(e) => {
            setDescription(e.target.value);
            settle({
              description: e.target.value,
              paidBy,
              owner,
              ownerChosen: false,
            });
          }}
          className="h-11"
        />
      </div>

      {personal ? (
        <PaymentMeans
          amex={amex}
          onAmex={setAmex}
          methods={activeMethods}
          methodId={methodId}
          onMethod={setMethodId}
          onCreated={(m) => {
            setMethods((prev) => [...prev, m]);
            setMethodId(m.id);
          }}
          idPrefix={idPrefix}
          person={me}
        />
      ) : (
        <fieldset className="space-y-1.5">
          <legend className={label}>Pagado por</legend>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <Chip
                key={p}
                active={paidBy === p}
                className="min-w-24"
                onClick={() => {
                  if (p === paidBy) return;
                  setPaidBy(p);
                  const nextOwner: Owner =
                    owner === "casa" || p === "otros" ? "casa" : p;
                  settle({
                    description,
                    paidBy: p,
                    owner: nextOwner,
                    ownerChosen: owner === "casa",
                  });
                }}
              >
                {PAID_BY_LABEL[p]}
              </Chip>
            ))}
          </div>
          {paidBy === "otros" && (
            <p className="text-xs text-muted-foreground">
              «Otros» solo existe en gastos antiguos; los nuevos los paga Andrea
              o Ricardo.
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="space-y-1.5">
        <legend className={label}>Cuenta en el Balance de</legend>
        <div className="flex flex-wrap gap-2">
          {owners.map((o) => (
            <Chip
              key={o}
              active={owner === o}
              className="min-w-24"
              onClick={() => {
                if (o === owner) return;
                settle({ description, paidBy, owner: o, ownerChosen: true });
              }}
            >
              {OWNER_LABEL[o]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className={label}>
          Concepto{" "}
          {suggested && conceptId && (
            <span className="font-semibold text-brand">
              · sugerido por gastos parecidos
            </span>
          )}
        </legend>
        {blindOwner ? (
          <p
            role="alert"
            className="rounded-xl border border-warning/40 p-3 text-xs"
          >
            Para apuntar en el Balance de {OWNER_LABEL[owner]} falta ejecutar el
            script 08 (conceptos de Pagos).
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map((c) => (
              <Chip
                key={c.id}
                active={conceptId === c.id}
                onClick={() => {
                  setConceptId(c.id);
                  setConceptTouched(true);
                  setSuggested(false);
                }}
              >
                {c.name}
                {c.archived && " (archivado)"}
              </Chip>
            ))}
            {canCreateOthers && (
              <Chip
                active={conceptId === null}
                onClick={() => {
                  setConceptId(null);
                  setConceptTouched(true);
                  setSuggested(false);
                }}
              >
                {OTHERS_NAME}
              </Chip>
            )}
          </div>
        )}
        {canCreateOthers && conceptId === null && !blindOwner && (
          <p className="text-xs text-muted-foreground">
            {OWNER_LABEL[owner]} aún no tiene «{OTHERS_NAME}»: se creará al
            guardar.
          </p>
        )}
      </fieldset>

      {amex && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={pending}
            onChange={(e) => {
              setPending(e.target.checked);
              setPendingTouched(true);
            }}
            className="size-5 accent-brand"
          />
          Pendiente de traspaso
        </label>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-comment`} className={label}>
          Comentario (opcional)
        </label>
        <Input
          id={`${idPrefix}-comment`}
          placeholder="Añade una nota"
          value={comment}
          maxLength={500}
          onChange={(e) => setComment(e.target.value)}
          className="h-11"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {editing &&
          (confirmDelete ? (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={remove}
              className="h-11 sm:mr-auto"
            >
              Sí, borrar el gasto
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="h-11 sm:mr-auto"
            >
              Borrar
            </Button>
          ))}
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
            className="h-11"
          >
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={!canSave} className="h-11">
          {busy ? "Guardando…" : "Guardar gasto"}
        </Button>
      </div>
    </form>
  );
}

/** Pagos personales: casilla «Pagado con AMEX» o medio de pago (con «+ Nuevo»). */
function PaymentMeans({
  amex,
  onAmex,
  methods,
  methodId,
  onMethod,
  onCreated,
  idPrefix,
  person,
}: {
  person: Person;
  amex: boolean;
  onAmex: (v: boolean) => void;
  methods: PaymentMethod[];
  methodId: string | null;
  onMethod: (id: string) => void;
  onCreated: (m: PaymentMethod) => void;
  idPrefix: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PaymentMethodKind>("tarjeta");
  const [busy, start] = useTransition();
  const label = "text-xs font-bold text-muted-foreground";

  const create = () =>
    start(async () => {
      const res = await newPaymentMethodAction(name, kind, person);
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success(`Medio de pago «${res.method.name}» añadido`);
        onCreated(res.method);
        setAdding(false);
        setName("");
      });
    });

  return (
    <div className="space-y-3">
      <label className="flex min-h-12 items-center gap-3 rounded-xl border bg-brand-soft px-3 text-sm font-bold">
        <input
          type="checkbox"
          checked={amex}
          onChange={(e) => onAmex(e.target.checked)}
          className="size-5 accent-brand"
        />
        <span>
          Pagado con AMEX
          <span className="block text-xs font-normal text-muted-foreground">
            Sale también en la lista de la American Express.
          </span>
        </span>
      </label>
      {!amex && (
        <fieldset className="space-y-1.5">
          <legend className={label}>Medio de pago</legend>
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <Chip
                key={m.id}
                active={methodId === m.id}
                onClick={() => onMethod(m.id)}
              >
                {m.name}
                {m.archived && " (archivado)"}
              </Chip>
            ))}
            <Chip active={adding} onClick={() => setAdding((v) => !v)}>
              + Nuevo
            </Chip>
          </div>
          {methods.length === 0 && !adding && (
            <p className="text-xs text-warning">
              Añade un medio de pago para poder guardar.
            </p>
          )}
          {adding && (
            <div className="space-y-2 rounded-xl border p-3">
              <label htmlFor={`${idPrefix}-method`} className={label}>
                Nombre del medio de pago
              </label>
              <Input
                id={`${idPrefix}-method`}
                placeholder="Ej.: Bankinter, Revolut…"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (name.trim() && !busy) create();
                  }
                }}
                className="h-11"
              />
              <div className="flex flex-wrap items-center gap-2">
                {PAYMENT_METHOD_KINDS.map((k) => (
                  <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                    {PAYMENT_METHOD_KIND_LABEL[k]}
                  </Chip>
                ))}
                <Button
                  type="button"
                  disabled={!name.trim() || busy}
                  onClick={create}
                  className="ml-auto h-11"
                >
                  {busy ? "Añadiendo…" : "Añadir"}
                </Button>
              </div>
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
