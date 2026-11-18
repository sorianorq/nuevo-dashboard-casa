"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/format";
import type { Purchase } from "@/lib/calc/supermarket";
import { PAYMENT_TYPE_LABEL, SUPER_CATEGORIES, SUPER_CATEGORY_NAME, type PaymentType } from "@/lib/labels";
import { parseAmount } from "@/components/balances/balance-editor";
import { removePurchase, savePurchase } from "@/app/(app)/supermercado/actions";

type PaidBy = "otros" | "andrea" | "ricardo";
const PAID_BY_LABEL: Record<PaidBy, string> = { otros: "Otros (Casa)", andrea: "Andrea", ricardo: "Ricardo" };
const PAYMENTS: PaymentType[] = ["tarjeta", "efectivo", "amex", "otros"];
const SHORT: Record<string, string> = {
  frutas: "Frutas",
  carnes: "Carnes",
  pescados: "Pescados",
  legumbres: "Legumbres",
  lacteos: "Lácteos",
  embutidos: "Embutidos",
  panaderia: "Panadería",
  bebidas: "Bebidas",
  conservas: "Conservas",
  snacks: "Snacks",
  limpieza: "Limpieza",
  higiene: "Higiene",
  congelados: "Congelados",
  otros: "Otros",
};

type Ctx = { openNew: () => void; openEdit: (p: Purchase) => void };
const EditorContext = createContext<Ctx | null>(null);

export function usePurchaseEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("usePurchaseEditor fuera de PurchaseEditor");
  return ctx;
}

/** Proveedor de alta y edición de compras (formulario en ventana). */
export function PurchaseEditor({ stores, today, children }: { stores: string[]; today: string; children: React.ReactNode }) {
  const [state, setState] = useState<{ purchase: Purchase | null; key: number } | null>(null);
  return (
    <EditorContext.Provider
      value={{
        openNew: () => setState({ purchase: null, key: Date.now() }),
        openEdit: (purchase) => setState({ purchase, key: Date.now() }),
      }}
    >
      {children}
      {state && (
        <PurchaseForm key={state.key} purchase={state.purchase} stores={stores} today={today} onClose={() => setState(null)} />
      )}
    </EditorContext.Provider>
  );
}

export function NewPurchaseButton() {
  const { openNew } = usePurchaseEditor();
  return (
    <Button onClick={openNew} className="h-11 rounded-xl px-4">
      <Plus aria-hidden /> Nueva compra
    </Button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-3.5 text-sm font-semibold transition-colors",
        active ? "border-foreground bg-foreground text-background" : "bg-surface hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function PurchaseForm({
  purchase,
  stores,
  today,
  onClose,
}: {
  purchase: Purchase | null;
  stores: string[];
  today: string;
  onClose: () => void;
}) {
  const editing = purchase !== null;
  const usual = stores.slice(0, 5);
  const initialStore = purchase?.store?.trim() ?? usual[0] ?? "";
  const [date, setDate] = useState(purchase?.date ?? today);
  const [store, setStore] = useState(initialStore);
  const [otherStore, setOtherStore] = useState(!usual.includes(initialStore) && initialStore !== "");
  const [payment, setPayment] = useState<PaymentType>(
    purchase?.payment && (PAYMENTS as string[]).includes(purchase.payment) ? (purchase.payment as PaymentType) : "tarjeta",
  );
  const [paidBy, setPaidBy] = useState<PaidBy>(purchase?.amexPaidBy ?? "otros");
  const [lines, setLines] = useState<{ catId: string; amount: number }[]>(() => {
    const m = new Map<string, number>();
    for (const l of purchase?.lines ?? []) m.set(l.catId, Math.round(((m.get(l.catId) ?? 0) + l.amount) * 100) / 100);
    return [...m].map(([catId, amount]) => ({ catId, amount }));
  });
  const [cat, setCat] = useState<string>("frutas");
  const [amount, setAmount] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const parsed = parseAmount(amount);
  const amountValid = parsed !== null && !Number.isNaN(parsed) && parsed > 0;
  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const canSave = lines.length > 0 && store.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !pending;

  const addLine = () => {
    if (!amountValid || parsed === null) return;
    setLines((prev) => {
      const i = prev.findIndex((l) => l.catId === cat);
      if (i < 0) return [...prev, { catId: cat, amount: Math.round(parsed * 100) / 100 }];
      const next = [...prev];
      next[i] = { catId: cat, amount: Math.round((next[i].amount + parsed) * 100) / 100 };
      return next;
    });
    setAmount("");
  };

  const save = () =>
    start(async () => {
      const res = await savePurchase(purchase?.id ?? null, { date, store, payment, paidBy, lines });
      if (!res.ok) return void toast.error(res.error);
      // Cerrar dentro de la transición: así se cierra junto con la página ya actualizada.
      start(() => {
        toast.success(editing ? "Compra actualizada" : "Compra guardada");
        onClose();
      });
    });

  const remove = () =>
    start(async () => {
      if (!purchase) return;
      const res = await removePurchase(purchase.id);
      if (!res.ok) return void toast.error(res.error);
      start(() => {
        toast.success("Compra borrada");
        onClose();
      });
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar compra" : "Nueva compra"}</DialogTitle>
          <DialogDescription>Las líneas van por categoría; repetir una categoría suma a su línea.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="p-date" className="text-xs font-bold text-muted-foreground">
              Fecha
            </label>
            <Input id="p-date" type="date" value={date} max="2100-12-31" onChange={(e) => setDate(e.target.value)} className="h-11" />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-bold text-muted-foreground">Tienda</legend>
            <div className="flex flex-wrap gap-2">
              {usual.map((s) => (
                <Chip
                  key={s}
                  active={!otherStore && store === s}
                  onClick={() => {
                    setOtherStore(false);
                    setStore(s);
                  }}
                >
                  {s}
                </Chip>
              ))}
              <Chip
                active={otherStore}
                onClick={() => {
                  setOtherStore(true);
                  if (usual.includes(store)) setStore("");
                }}
              >
                Otra
              </Chip>
            </div>
            {otherStore && (
              <Input
                aria-label="Nombre de la tienda"
                placeholder="Nombre de la tienda"
                list="p-stores"
                value={store}
                maxLength={80}
                onChange={(e) => setStore(e.target.value)}
                className="h-11"
              />
            )}
            <datalist id="p-stores">
              {stores.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-bold text-muted-foreground">Forma de pago</legend>
            <div className="flex flex-wrap gap-2">
              {PAYMENTS.map((p) => (
                <Chip key={p} active={payment === p} onClick={() => setPayment(p)}>
                  {PAYMENT_TYPE_LABEL[p]}
                </Chip>
              ))}
            </div>
            {payment === "amex" && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-semibold text-brand">Se añadirá también en Pagos · Amex (Casa › Compra).</p>
                <label htmlFor="p-paidby" className="text-xs font-bold text-muted-foreground">
                  Pagado por
                </label>
                <select
                  id="p-paidby"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value as PaidBy)}
                  className="h-11 w-full rounded-xl border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {(Object.keys(PAID_BY_LABEL) as PaidBy[]).map((k) => (
                    <option key={k} value={k}>
                      {PAID_BY_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-muted-foreground">Categoría</legend>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {SUPER_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={cat === c.id}
                  title={c.name}
                  onClick={() => setCat(c.id)}
                  className={cn(
                    "min-h-12 rounded-xl border px-1 text-[11px] font-bold transition-colors",
                    cat === c.id ? "border-foreground bg-foreground text-background" : "border-transparent bg-brand-soft text-brand hover:border-brand/40",
                  )}
                >
                  {SHORT[c.id]}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addLine();
              }}
            >
              <Input
                aria-label={`Importe de ${SUPER_CATEGORY_NAME[cat]}`}
                inputMode="decimal"
                autoComplete="off"
                placeholder={`Importe · ${SHORT[cat]}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={amount !== "" && !amountValid}
                className="h-11 min-w-0 flex-1 text-right tabular-nums"
              />
              <Button type="submit" disabled={!amountValid} className="h-11 rounded-xl px-4">
                <Plus aria-hidden /> Añadir
              </Button>
            </form>
          </fieldset>

          <ul className="border-t">
            {lines.length === 0 && <li className="py-3 text-sm text-muted-foreground">Aún no hay líneas.</li>}
            {lines.map((l) => (
              <li key={l.catId} className="flex min-h-11 items-center gap-2 border-b">
                <span className="flex-1 text-sm font-semibold">{SUPER_CATEGORY_NAME[l.catId] ?? l.catId}</span>
                <span className="text-sm font-bold tabular-nums">{formatAmount(l.amount)}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${SUPER_CATEGORY_NAME[l.catId] ?? l.catId}`}
                  onClick={() => setLines((prev) => prev.filter((x) => x.catId !== l.catId))}
                  className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-bold">Total compra</span>
            <span className="text-2xl font-extrabold tabular-nums">{formatAmount(total)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {editing &&
            (confirmDelete ? (
              <Button variant="destructive" disabled={pending} onClick={remove} className="sm:mr-auto">
                Sí, borrar la compra
              </Button>
            ) : (
              <Button variant="outline" disabled={pending} onClick={() => setConfirmDelete(true)} className="sm:mr-auto">
                Borrar
              </Button>
            ))}
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!canSave} onClick={save}>
            {pending ? "Guardando…" : "Guardar compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
