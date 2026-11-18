"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentForm } from "@/components/pagos/payment-form";
import type { Payment } from "@/lib/calc/pagos";
import type { ManualForm } from "./movements-list";

/**
 * Editar un gasto apuntado a mano desde Movimientos, con el formulario de
 * siempre: si se pagó con la Amex, el de la Amex (con «Pagado por»); si no,
 * el de la persona (medio de pago o casilla «Pagado con AMEX»).
 */
export function ManualPaymentDialog({ payment, form, onClose }: { payment: Payment; form: ManualForm; onClose: () => void }) {
  const amex = payment.wallet === "amex";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar gasto</DialogTitle>
          <DialogDescription>Apuntado a mano{amex ? " · American Express" : ""}.</DialogDescription>
        </DialogHeader>
        <PaymentForm
          mode={amex ? "amex" : "personal"}
          methods={form.methods}
          payment={payment}
          concepts={form.concepts}
          conceptsComplete={form.conceptsComplete}
          history={form.history}
          me={form.me}
          visibleOwners={form.visibleOwners}
          today={form.today}
          idPrefix="mov"
          onDone={onClose}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
