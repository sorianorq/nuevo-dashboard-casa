"use client";

import { useState } from "react";
import { ChevronRight, Receipt, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePurchaseEditor } from "./purchase-editor";
import { formatAmount, formatDate } from "@/lib/format";
import { linesMismatch, type Purchase } from "@/lib/calc/supermarket";
import { PAYMENT_TYPE_LABEL, SUPER_CATEGORIES, SUPER_CATEGORY_NAME, type PaymentType } from "@/lib/labels";

const payLabel = (p: string | null) => (p && p in PAYMENT_TYPE_LABEL ? PAYMENT_TYPE_LABEL[p as PaymentType] : "Sin forma de pago");
const payNote = (p: Purchase) =>
  p.payment === "amex" ? (p.amexPaidBy ? "Amex · también en la lista de la Amex" : "Amex · sin gasto en la lista de la Amex") : payLabel(p.payment);

/** Historial de compras del mes; al tocar una, su detalle. */
export function PurchaseHistory({ purchases }: { purchases: Purchase[] }) {
  const [open, setOpen] = useState<Purchase | null>(null);

  return (
    <section className="rounded-card border bg-card p-4 lg:p-5" aria-labelledby="hist-title">
      <h2 id="hist-title" className="mb-2 text-base font-bold">
        Historial
      </h2>
      {purchases.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Sin compras este mes.</p>
      ) : (
        <ul>
          {purchases.map((p) => (
            <li key={p.id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(p)}
                className="flex min-h-13 w-full items-center gap-3 py-1.5 text-left hover:bg-accent"
              >
                <span className="w-12 shrink-0 text-[13px] text-muted-foreground tabular-nums">
                  {formatDate(p.date).slice(0, 5)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {p.store?.trim() || "Sin tienda"}
                    {p.ticketPath && (
                      <Receipt className="size-3.5 shrink-0 text-brand" aria-label="Con foto del ticket" role="img" />
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{payNote(p)}</span>
                </span>
                <span className="text-[15px] font-bold tabular-nums">{formatAmount(p.total)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <PurchaseDetail purchase={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function PurchaseDetail({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const { openEdit } = usePurchaseEditor();
  // Líneas agrupadas por categoría, en el orden de las 14 categorías.
  const byCat = new Map<string, number>();
  for (const l of purchase.lines) byCat.set(l.catId, Math.round(((byCat.get(l.catId) ?? 0) + l.amount) * 100) / 100);
  const order = SUPER_CATEGORIES.map((c) => c.id as string);
  const lines = [...byCat].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const diff = linesMismatch(purchase);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{purchase.store?.trim() || "Compra"}</DialogTitle>
          <DialogDescription>
            {formatDate(purchase.date)} · {payNote(purchase)}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-xl border text-sm">
          {lines.map(([catId, amount]) => (
            <li key={catId} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span>{SUPER_CATEGORY_NAME[catId] ?? catId}</span>
              <span className="font-semibold tabular-nums">{formatAmount(amount)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-bold">Total compra</span>
          <span className="text-2xl font-extrabold tabular-nums">{formatAmount(purchase.total)}</span>
        </div>
        {diff !== null && (
          <p role="note" className="flex gap-2 rounded-xl border border-warning/40 p-3 text-xs">
            <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
            El total no coincide con la suma de las líneas (diferencia {formatAmount(diff)}). El gasto del mes usa el total.
            Al editarla y guardarla, el total pasará a ser la suma de las líneas.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            onClick={() => {
              onClose();
              openEdit(purchase);
            }}
          >
            Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
