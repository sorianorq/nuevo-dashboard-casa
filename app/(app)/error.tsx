"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Error al cargar una pantalla (p. ej. fallo de base de datos). Sin detalles internos. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="fc-float px-6 py-12 text-center">
      <p className="text-[18px] font-extrabold">No se han podido cargar los datos</p>
      <p className="mt-1 text-muted-foreground">Vuelve a intentarlo en unos segundos.</p>
      <Button variant="outline" className="mt-6" onClick={() => retry()}>
        Reintentar
      </Button>
    </div>
  );
}
