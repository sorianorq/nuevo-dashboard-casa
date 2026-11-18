"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate, formatSignedAmount } from "@/lib/format";
import {
  applyToSimilar,
  changeConcept,
  type SimilarTx,
} from "@/app/(app)/movimientos/actions";
import { useConcepts } from "./concepts-context";

type Pending = { conceptId: string; conceptName: string; similar: SimilarTx[] };

type Ctx = {
  /** Guarda el concepto y, si hay movimientos parecidos, ofrece aplicarlo. */
  setConcept: (txId: string, conceptId: string | null) => Promise<boolean>;
};

const ConceptChangeContext = createContext<Ctx | null>(null);

export function ConceptChangeProvider({ children }: { children: React.ReactNode }) {
  const { tab, byId } = useConcepts();
  const [pending, setPending] = useState<Pending | null>(null);
  const [applying, startApply] = useTransition();

  const setConcept = useCallback(
    async (txId: string, conceptId: string | null) => {
      const res = await changeConcept(tab, txId, conceptId);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      if (conceptId && res.similar.length > 0) {
        setPending({ conceptId, conceptName: byId.get(conceptId)?.name ?? "", similar: res.similar });
      } else {
        toast.success("Concepto guardado");
      }
      return true;
    },
    [tab, byId],
  );

  const value = useMemo(() => ({ setConcept }), [setConcept]);
  const n = pending?.similar.length ?? 0;

  return (
    <ConceptChangeContext.Provider value={value}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(o) => !o && !applying && setPending(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {n === 1 ? "Hay 1 movimiento parecido" : `Hay ${n} movimientos parecidos`}
            </DialogTitle>
            <DialogDescription>
              ¿Aplicar también «{pending?.conceptName}»? Se ha guardado el movimiento que has cambiado.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 divide-y overflow-y-auto rounded-xl border text-sm">
            {pending?.similar.slice(0, 50).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.description}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(s.date)}</span>
                </span>
                <span className="amount text-sm font-semibold">{formatSignedAmount(s.amount)}</span>
              </li>
            ))}
            {n > 50 && <li className="px-3 py-2 text-xs text-muted-foreground">y {n - 50} más…</li>}
          </ul>
          <DialogFooter>
            <Button variant="outline" disabled={applying} onClick={() => setPending(null)}>
              No, solo este
            </Button>
            <Button
              disabled={applying}
              onClick={() =>
                startApply(async () => {
                  if (!pending) return;
                  const res = await applyToSimilar(tab, pending.similar.map((s) => s.id), pending.conceptId);
                  if (res.ok) {
                    toast.success(`Concepto aplicado a ${res.updated} movimientos`);
                    setPending(null);
                  } else toast.error(res.error);
                })
              }
            >
              {applying ? "Aplicando…" : `Aplicar a ${n}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConceptChangeContext.Provider>
  );
}

export function useConceptChange() {
  const ctx = useContext(ConceptChangeContext);
  if (!ctx) throw new Error("useConceptChange fuera de ConceptChangeProvider");
  return ctx;
}
