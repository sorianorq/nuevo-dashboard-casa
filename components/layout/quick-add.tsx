"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type QuickAddContextValue = { open: () => void };

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd fuera de QuickAddProvider");
  return ctx;
}

/** Alta rápida de gasto (hoja inferior). En la fase 1: «Próximamente». */
export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setIsOpen(true) }), []);

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-lg rounded-t-3xl px-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="pt-6">
            <p className="eyebrow">Alta rápida</p>
            <SheetTitle className="text-[22px] font-extrabold tracking-tight">
              Añadir gasto
            </SheetTitle>
            <SheetDescription>Disponible en una próxima fase.</SheetDescription>
          </SheetHeader>
          <div className="mx-4 mb-2 flex items-center gap-3 rounded-card bg-brand-soft p-4">
            <Clock className="size-5 shrink-0 text-brand" aria-hidden />
            <p className="font-semibold">Próximamente</p>
          </div>
        </SheetContent>
      </Sheet>
    </QuickAddContext.Provider>
  );
}
