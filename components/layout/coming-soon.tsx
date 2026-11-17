import { Clock } from "lucide-react";
import { OWNER_LABEL, type Owner } from "@/lib/balance";

/** Pantalla «Próximamente» dentro del layout (fases 2–5). */
export function ComingSoon({ owner }: { owner?: Owner }) {
  return (
    <div className="rounded-card border bg-card px-6 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-soft">
        <Clock className="size-6 text-brand" aria-hidden />
      </span>
      <p className="mt-4 text-[18px] font-extrabold">Próximamente</p>
      <p className="mt-1 text-muted-foreground">Esta sección llegará en una próxima fase.</p>
      {owner && (
        <p className="mt-4 text-xs text-muted-foreground">
          Balance seleccionado: <span className="font-bold text-foreground">{OWNER_LABEL[owner]}</span>
        </p>
      )}
    </div>
  );
}
