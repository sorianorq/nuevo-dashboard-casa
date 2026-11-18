"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatSignedAmount } from "@/lib/format";
import { FLOWS, type Flow, type Transaction } from "@/lib/labels";
import { changeFlow } from "@/app/(app)/contabilidad/movimientos/actions";
import { ConceptPicker } from "./concept-picker";
import { useConceptChange } from "./concept-change";
import { useConcepts } from "./concepts-context";

/** Revisión uno a uno de movimientos sin concepto. */
export function ReviewCard({
  tx,
  accountName,
  suggestion,
  skipHref,
}: {
  tx: Transaction;
  accountName: string;
  suggestion: { conceptId: string; source: "exact" | "similar" } | null;
  skipHref: string;
}) {
  const { tab, byId } = useConcepts();
  const { setConcept } = useConceptChange();
  const [pending, start] = useTransition();
  const suggested = suggestion ? byId.get(suggestion.conceptId) : undefined;

  const assign = (id: string | null) => start(async () => void (await setConcept(tx.id, id)));

  return (
    <article className="rounded-card border bg-card p-5 lg:p-6" aria-busy={pending}>
      <p className="text-xs text-muted-foreground">
        {formatDate(tx.date)} · {accountName}
      </p>
      <h2 className="mt-1 text-[18px] leading-snug font-extrabold break-words">{tx.description}</h2>
      <p className={cn("amount mt-2 text-left text-[24px] font-extrabold", tx.amount > 0 && "text-positive")}>
        {formatSignedAmount(tx.amount)}
      </p>

      {suggested && (
        <div className="mt-5 flex flex-col gap-2 rounded-2xl bg-brand-soft p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 shrink-0 text-brand" aria-hidden />
            <span>
              Sugerido: <span className="font-bold">{suggested.name}</span>
              <span className="ml-1 text-xs text-muted-foreground">
                ({suggestion?.source === "exact" ? "misma descripción" : "descripción parecida"})
              </span>
            </span>
          </p>
          <Button disabled={pending} onClick={() => assign(suggested.id)}>
            Aplicar
          </Button>
        </div>
      )}

      <div className="mt-5 space-y-1.5">
        <p className="text-xs font-bold text-muted-foreground">Elegir concepto</p>
        <ConceptPicker
          value={null}
          disabled={pending}
          defaultSection={tx.amount > 0 ? "ingresos" : "gastos"}
          onChange={(id) => id && assign(id)}
        />
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="text-xs text-muted-foreground">¿No cuenta como ingreso ni gasto?</span>
        {(["internal_transfer", "card_settlement"] as Flow[]).map((f) => (
          <Button
            key={f}
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await changeFlow(tab, tx.id, f);
                if (res.ok) toast.success(`Marcado como ${FLOWS[f].toLowerCase()}`);
                else toast.error(res.error);
              })
            }
          >
            {FLOWS[f]}
          </Button>
        ))}
        <Link href={skipHref} scroll={false} className={cn(buttonVariants({ variant: "ghost" }), "sm:ml-auto")}>
          Saltar
        </Link>
      </div>
    </article>
  );
}
