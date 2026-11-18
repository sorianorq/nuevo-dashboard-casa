"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentForm } from "@/components/pagos/payment-form";
import type { QuickAddData } from "@/lib/data/pagos";
import { quickAddDataAction } from "@/app/(app)/pagos/actions";

type QuickAddContextValue = { open: () => void };

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd fuera de QuickAddProvider");
  return ctx;
}

/**
 * Alta rápida de gasto (➕ en móvil, «+ Añadir gasto» en ordenador): el
 * formulario de Pagos de la persona, con la casilla «Pagado con AMEX».
 */
export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<{ data: QuickAddData; today: string; key: number } | null>(null);
  const [, start] = useTransition();

  const value = useMemo(
    () => ({
      open: () => {
        setIsOpen(true);
        setState(null);
        start(async () => {
          const res = await quickAddDataAction();
          if (!res.ok) {
            toast.error(res.error);
            start(() => setIsOpen(false));
            return;
          }
          start(() => setState({ data: res.data, today: res.today, key: Date.now() }));
        });
      },
    }),
    [],
  );

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl px-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="pt-6">
            <p className="eyebrow">Alta rápida</p>
            <SheetTitle className="text-[22px] font-extrabold tracking-tight">Nuevo gasto</SheetTitle>
            <SheetDescription>Se apunta en tus Pagos; con AMEX, también en la American Express.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2">
            {state ? (
              <PaymentForm
                key={state.key}
                mode="personal"
                payment={null}
                methods={state.data.methods}
                concepts={state.data.concepts}
                conceptsComplete={state.data.conceptsComplete}
                history={state.data.history}
                me={state.data.me}
                visibleOwners={state.data.visibleOwners}
                today={state.today}
                idPrefix="quick"
                onDone={() => setIsOpen(false)}
                onCancel={() => setIsOpen(false)}
              />
            ) : (
              <div className="space-y-3" aria-busy="true" aria-label="Cargando">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </QuickAddContext.Provider>
  );
}
