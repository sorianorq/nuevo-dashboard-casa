"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, Check, Loader2, Plus, Receipt, X } from "lucide-react";
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
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/balance";
import { formatAmount } from "@/lib/format";
import type { Purchase } from "@/lib/calc/supermarket";
import { PAYMENT_TYPE_LABEL, SUPER_CATEGORIES, SUPER_CATEGORY_NAME, type PaymentType } from "@/lib/labels";
import { parseAmount } from "@/components/balances/balance-editor";
import { getTicketPhoto, removePurchase, savePurchase } from "@/app/(app)/supermercado/actions";

type PaidBy = Person;
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

type TicketRow = { key: number; text: string; amount: string; catId: string };
type Ticket = { path: string; total: number | null; photo: string | null; rows: TicketRow[] };
type ReadResponse =
  | {
      ok: true;
      path: string;
      read: {
        store: string | null;
        date: string | null;
        total: number | null;
        payment: "tarjeta" | "efectivo" | "amex" | null;
        lines: { text: string; amount: number; category: string }[];
      };
    }
  | { ok: false; error: string };

const toText = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
let rowKey = 0;

/** Reduce la foto en el móvil (lado largo 2400 px, JPEG) antes de subirla. */
async function compressPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (!blob) throw new Error("No se pudo preparar la foto.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Ctx = { openNew: () => void; openEdit: (p: Purchase) => void; openWithPhoto: (file: File) => void };
const EditorContext = createContext<Ctx | null>(null);

export function usePurchaseEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("usePurchaseEditor fuera de PurchaseEditor");
  return ctx;
}

/** Proveedor de alta y edición de compras (formulario en ventana). */
export function PurchaseEditor({
  stores,
  today,
  me,
  children,
}: {
  stores: string[];
  today: string;
  /** Quien ha entrado (por defecto, quien paga con Amex). */
  me: Person;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{ purchase: Purchase | null; key: number; photo?: File } | null>(null);
  return (
    <EditorContext.Provider
      value={{
        openNew: () => setState({ purchase: null, key: Date.now() }),
        openEdit: (purchase) => setState({ purchase, key: Date.now() }),
        openWithPhoto: (photo) => setState({ purchase: null, key: Date.now(), photo }),
      }}
    >
      {children}
      {state && (
        <PurchaseForm
          key={state.key}
          purchase={state.purchase}
          initialPhoto={state.photo}
          stores={stores}
          today={today}
          me={me}
          onClose={() => setState(null)}
        />
      )}
    </EditorContext.Provider>
  );
}

/**
 * Botón flotante del móvil (encima de la barra inferior): abre directamente la
 * cámara y, con la foto hecha, la compra nueva leyendo el ticket.
 */
export function TicketCameraButton() {
  const { openWithPhoto } = usePurchaseEditor();
  return (
    <label className="ticket-fab fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 flex h-14 cursor-pointer items-center gap-2 rounded-full bg-foreground pr-5 pl-4 text-[15px] font-bold text-background shadow-lg ring-4 ring-background transition-transform active:scale-95 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring lg:hidden">
      <Receipt className="size-5" aria-hidden />
      Ticket
      <input
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Hacer foto del ticket de la compra"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) openWithPhoto(f);
        }}
      />
    </label>
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

function PurchaseForm({
  purchase,
  initialPhoto,
  stores,
  today,
  me,
  onClose,
}: {
  purchase: Purchase | null;
  /** Foto hecha con el botón «Ticket»: se lee al abrir. */
  initialPhoto?: File;
  stores: string[];
  today: string;
  me: Person;
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
  // Sin selector: quien apunta (las compras antiguas conservan el suyo).
  const [paidBy] = useState<PaidBy>(purchase?.amexPaidBy === "andrea" || purchase?.amexPaidBy === "ricardo" ? purchase.amexPaidBy : me);
  const [lines, setLines] = useState<{ catId: string; amount: number }[]>(() => {
    const m = new Map<string, number>();
    for (const l of purchase?.lines ?? []) m.set(l.catId, Math.round(((m.get(l.catId) ?? 0) + l.amount) * 100) / 100);
    return [...m].map(([catId, amount]) => ({ catId, amount }));
  });
  const [ticket, setTicket] = useState<Ticket | null>(() =>
    purchase?.ticketPath && purchase.ticketLines?.length
      ? {
          path: purchase.ticketPath,
          total: null,
          photo: null,
          rows: purchase.ticketLines.map((l) => ({ key: ++rowKey, text: l.text, amount: toText(l.amount), catId: l.catId })),
        }
      : null,
  );
  const [reading, setReading] = useState(Boolean(initialPhoto));
  const fileRef = useRef<HTMLInputElement>(null);
  // Foto ya guardada: enlace temporal al abrir la compra.
  const savedPath = purchase?.ticketPath ?? null;
  useEffect(() => {
    if (!savedPath) return;
    let alive = true;
    void getTicketPhoto(savedPath).then((res) => {
      if (alive && res.ok) setTicket((t) => (t && t.path === savedPath ? { ...t, photo: res.url } : t));
    });
    return () => {
      alive = false;
    };
  }, [savedPath]);
  const [cat, setCat] = useState<string>("frutas");
  const [amount, setAmount] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const parsed = parseAmount(amount);
  const amountValid = parsed !== null && !Number.isNaN(parsed) && parsed > 0;
  // Con ticket, las líneas por categoría salen de lo leído.
  const ticketRows = ticket?.rows.map((r) => ({ ...r, value: parseAmount(r.amount) })) ?? [];
  const badRows = ticketRows.filter((r) => r.value === null || Number.isNaN(r.value) || r.value === 0);
  const catLines = ticket
    ? (() => {
        const m = new Map<string, number>();
        for (const r of ticketRows) if (r.value && !Number.isNaN(r.value)) m.set(r.catId, Math.round(((m.get(r.catId) ?? 0) + r.value) * 100) / 100);
        return [...m].map(([catId, amount]) => ({ catId, amount }));
      })()
    : lines;
  const total = Math.round(catLines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const ticketDiff = ticket?.total != null ? Math.round((total - ticket.total) * 100) / 100 : null;
  const canSave =
    catLines.length > 0 &&
    store.trim() !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !pending &&
    !reading &&
    (!ticket || (badRows.length === 0 && ticketRows.length > 0));

  const readPhoto = async (file: File) => {
    setReading(true);
    try {
      const blob = await compressPhoto(file);
      const form = new FormData();
      form.append("photo", blob, "ticket.jpg");
      const res = (await fetch("/api/supermercado/ticket", { method: "POST", body: form }).then((r) => r.json())) as ReadResponse;
      if (!res.ok) return void toast.error(res.error);
      const r = res.read;
      setTicket({
        path: res.path,
        total: r.total,
        photo: URL.createObjectURL(blob),
        rows: r.lines.map((l) => ({
          key: ++rowKey,
          text: l.text,
          amount: toText(l.amount),
          catId: l.category in SUPER_CATEGORY_NAME ? l.category : "otros",
        })),
      });
      if (r.store) {
        const known = stores.find((s) => s.toLowerCase() === r.store!.toLowerCase());
        const name = known ?? r.store;
        setStore(name);
        setOtherStore(!usual.includes(name));
      }
      if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date <= today) setDate(r.date);
      if (r.payment) setPayment(r.payment);
      toast.success(`Ticket leído: ${r.lines.length} ${r.lines.length === 1 ? "línea" : "líneas"}. Revisa las categorías.`);
    } catch {
      toast.error("No se pudo leer el ticket. Revisa la conexión e inténtalo otra vez.");
    } finally {
      setReading(false);
    }
  };
  // Foto del botón «Ticket»: leerla nada más abrir (una vez).
  const started = useRef(false);
  useEffect(() => {
    if (!initialPhoto || started.current) return;
    started.current = true;
    void readPhoto(initialPhoto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPhoto]);
  const updateRow = (key: number, patch: Partial<TicketRow>) =>
    setTicket((t) => (t ? { ...t, rows: t.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : t));

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
      const res = await savePurchase(purchase?.id ?? null, {
        date,
        store,
        payment,
        paidBy,
        lines: catLines,
        ticket: ticket
          ? { path: ticket.path, lines: ticketRows.map((r) => ({ text: r.text, amount: r.value as number, catId: r.catId })) }
          : null,
      });
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
          <DialogDescription>
            Hazle una foto al ticket y se rellenan solas las líneas, o apúntalas a mano por categoría.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void readPhoto(f);
            }}
          />
          {reading ? (
            <div role="status" className="flex items-center gap-3 rounded-xl border bg-brand-soft/50 p-4 text-sm">
              <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
              <span>
                <strong className="block">Leyendo el ticket…</strong>
                <span className="text-muted-foreground">Suele tardar entre 10 y 30 segundos.</span>
              </span>
            </div>
          ) : ticket ? (
            <TicketPanel
              ticket={ticket}
              rows={ticketRows}
              total={total}
              diff={ticketDiff}
              onRetake={() => fileRef.current?.click()}
              onRemove={() => setTicket(null)}
              onRow={updateRow}
              onDeleteRow={(key) => setTicket((t) => (t ? { ...t, rows: t.rows.filter((r) => r.key !== key) } : t))}
            />
          ) : (
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="h-14 w-full rounded-xl text-base">
              <Camera aria-hidden /> Foto del ticket
            </Button>
          )}

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
                <p className="text-xs font-semibold text-brand">Se añadirá también en Movimientos · Amex (Casa › Compra).</p>
              </div>
            )}
          </fieldset>

          {!ticket && (
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
          )}

          {ticket && <h3 className="text-xs font-bold text-muted-foreground">Por categoría</h3>}
          <ul className="border-t">
            {catLines.length === 0 && <li className="py-3 text-sm text-muted-foreground">Aún no hay líneas.</li>}
            {catLines.map((l) => (
              <li key={l.catId} className="flex min-h-11 items-center gap-2 border-b">
                <span className="flex-1 text-sm font-semibold">{SUPER_CATEGORY_NAME[l.catId] ?? l.catId}</span>
                <span className="text-sm font-bold tabular-nums">{formatAmount(l.amount)}</span>
                {!ticket && (
                <button
                  type="button"
                  aria-label={`Quitar ${SUPER_CATEGORY_NAME[l.catId] ?? l.catId}`}
                  onClick={() => setLines((prev) => prev.filter((x) => x.catId !== l.catId))}
                  className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
                >
                  <X className="size-4" aria-hidden />
                </button>
                )}
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

/** Foto del ticket y líneas leídas: cada una con su categoría e importe (se pueden corregir). */
function TicketPanel({
  ticket,
  rows,
  total,
  diff,
  onRetake,
  onRemove,
  onRow,
  onDeleteRow,
}: {
  ticket: Ticket;
  rows: (TicketRow & { value: number | null })[];
  total: number;
  diff: number | null;
  onRetake: () => void;
  onRemove: () => void;
  onRow: (key: number, patch: Partial<TicketRow>) => void;
  onDeleteRow: (key: number) => void;
}) {
  return (
    <section aria-labelledby="ticket-title" className="space-y-3 rounded-xl border p-3">
      <div className="flex items-start gap-3">
        {ticket.photo ? (
          <a href={ticket.photo} target="_blank" rel="noreferrer" className="shrink-0" title="Ver la foto en grande">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ticket.photo} alt="Foto del ticket" className="h-24 w-16 rounded-lg border object-cover object-top" />
          </a>
        ) : (
          <div className="grid h-24 w-16 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 id="ticket-title" className="text-sm font-bold">
            Ticket · {rows.length} {rows.length === 1 ? "línea" : "líneas"}
          </h3>
          {diff === null ? (
            <p className="text-xs text-muted-foreground">Suma de las líneas: {formatAmount(total)}</p>
          ) : Math.abs(diff) < 0.005 ? (
            <p className="flex items-center gap-1 text-xs font-semibold text-positive">
              <Check className="size-3.5" aria-hidden /> Cuadra con el total del ticket ({formatAmount(total)})
            </p>
          ) : (
            <p className="flex items-start gap-1 text-xs font-semibold text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Las líneas suman {formatAmount(total)} y el ticket dice {formatAmount(total - diff)}: revisa los importes.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onRetake} className="h-9 rounded-lg">
              <Camera aria-hidden /> Otra foto
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-9 rounded-lg text-muted-foreground">
              Quitar ticket
            </Button>
          </div>
        </div>
      </div>
      <ul className="max-h-[45dvh] overflow-y-auto border-t">
        {rows.map((r) => {
          const bad = r.value === null || Number.isNaN(r.value) || r.value === 0;
          return (
            <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_2.25rem] items-center gap-x-2 gap-y-1 border-b py-2">
              <span className="truncate text-[13px] font-semibold" title={r.text}>
                {r.text}
              </span>
              <input
                aria-label={`Importe de ${r.text}`}
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => onRow(r.key, { amount: e.target.value })}
                aria-invalid={bad}
                className="h-9 w-full rounded-lg border bg-surface px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
              />
              <button
                type="button"
                aria-label={`Quitar ${r.text}`}
                onClick={() => onDeleteRow(r.key)}
                className="row-span-2 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" aria-hidden />
              </button>
              <select
                aria-label={`Categoría de ${r.text}`}
                value={r.catId}
                onChange={(e) => onRow(r.key, { catId: e.target.value })}
                className="col-span-2 h-9 w-full min-w-0 rounded-lg border bg-surface px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SUPER_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
