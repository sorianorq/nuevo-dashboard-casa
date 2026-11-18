"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { BalanceTab } from "@/lib/balance";
import type { ConceptOption } from "@/lib/labels";

type Ctx = {
  tab: BalanceTab;
  concepts: ConceptOption[];
  byId: Map<string, ConceptOption>;
  add: (c: ConceptOption) => void;
};

const ConceptsContext = createContext<Ctx | null>(null);

/** Catálogo de conceptos del Balance activo, compartido por todas las filas. */
export function ConceptsProvider({
  tab,
  initial,
  children,
}: {
  tab: BalanceTab;
  initial: ConceptOption[];
  children: React.ReactNode;
}) {
  const [concepts, setConcepts] = useState(initial);
  const add = useCallback(
    (c: ConceptOption) => setConcepts((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c])),
    [],
  );
  const value = useMemo(
    () => ({ tab, concepts, byId: new Map(concepts.map((c) => [c.id, c])), add }),
    [tab, concepts, add],
  );
  return <ConceptsContext.Provider value={value}>{children}</ConceptsContext.Provider>;
}

export function useConcepts() {
  const ctx = useContext(ConceptsContext);
  if (!ctx) throw new Error("useConcepts fuera de ConceptsProvider");
  return ctx;
}
