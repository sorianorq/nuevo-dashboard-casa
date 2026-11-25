"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { BalanceRow } from "@/lib/calc/balance";
import type { ConceptSection } from "@/lib/labels";
import { moveConcept } from "@/app/(app)/contabilidad/balances/actions";
import { useBalanceEditor } from "./balance-editor";

/**
 * Colocar conceptos arrastrando la fila por su asa (⋮⋮). Las filas llevan
 * `rowDragAttrs` y viven dentro de un elemento con `data-drag-scope`:
 * - un concepto se puede soltar entre dos filas de su bloque, dentro de un
 *   grupo (soltándolo sobre la fila del subtotal) o al final del bloque;
 * - un subtotal se mueve con todo su grupo, solo en primer nivel.
 * Con teclado: flechas arriba/abajo sobre el asa.
 */

export type DropTarget = { kind: "before"; rowId: string } | { kind: "into"; rowId: string } | { kind: "end" };

type Drag = { row: BalanceRow; section: ConceptSection; target: DropTarget | null };

/** Atributos que marcan una fila como sitio donde soltar. `groupId` = subtotal al que pertenece. */
export function rowDragAttrs(row: BalanceRow, section: ConceptSection, groupId: string | null) {
  return {
    "data-drag-id": row.id,
    "data-drag-section": section,
    "data-drag-kind": row.kind === "subtotal" ? "subtotal" : "concept",
    "data-drag-parent": groupId ?? "",
  };
}

const EDGE = 48;

export function useRowDrag() {
  const { reorder } = useBalanceEditor();
  const [drag, setDrag] = useState<Drag | null>(null);
  const scope = useRef<HTMLElement | null>(null);
  const lastY = useRef(0);

  const scrollBox = () => {
    const el = scope.current;
    return el && el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== "visible" ? el : null;
  };

  const compute = (d: Drag, y: number): DropTarget | null => {
    const root = scope.current;
    if (!root) return null;
    let els = [...root.querySelectorAll<HTMLElement>(`[data-drag-section="${d.section}"]`)].filter(
      (el) => el.dataset.dragId !== d.row.id && el.dataset.dragParent !== d.row.id && el.getBoundingClientRect().height > 0,
    );
    const isGroup = d.row.kind === "subtotal";
    if (isGroup) els = els.filter((el) => !el.dataset.dragParent);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (!isGroup && el.dataset.dragKind === "subtotal" && y > r.top + r.height * 0.3 && y < r.bottom - r.height * 0.3) {
        return { kind: "into", rowId: el.dataset.dragId! };
      }
      if (y < r.top + r.height / 2) return { kind: "before", rowId: el.dataset.dragId! };
    }
    return { kind: "end" };
  };

  // Mientras se arrastra: desplazar la caja (o la página) si el dedo/ratón está cerca del borde.
  useEffect(() => {
    if (!drag) return;
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const t = setInterval(() => {
      const box = scrollBox();
      const top = box ? box.getBoundingClientRect().top : 0;
      const bottom = box ? box.getBoundingClientRect().bottom : window.innerHeight;
      const y = lastY.current;
      const step = y < top + EDGE ? -14 : y > bottom - EDGE ? 14 : 0;
      if (!step) return;
      if (box) box.scrollTop += step;
      else window.scrollBy(0, step);
      setDrag((d) => (d ? { ...d, target: compute(d, y) } : d));
    }, 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.userSelect = prevSelect;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const drop = (d: Drag) => {
    const t = d.target;
    if (!t || !scope.current) return;
    let target: { parentId: string | null; beforeId: string | null };
    if (t.kind === "into") target = { parentId: t.rowId, beforeId: null };
    else if (t.kind === "end") target = { parentId: null, beforeId: null };
    else {
      const el = scope.current.querySelector<HTMLElement>(`[data-drag-id="${t.rowId}"]`);
      target = { parentId: el?.dataset.dragParent || null, beforeId: t.rowId };
    }
    // Soltar justo donde estaba: nada que hacer.
    const own = scope.current.querySelector<HTMLElement>(`[data-drag-id="${d.row.id}"]`);
    const ownParent = own?.dataset.dragParent || null;
    if (target.parentId === ownParent) {
      const same = [...scope.current.querySelectorAll<HTMLElement>(`[data-drag-section="${d.section}"]`)].filter(
        (el) => (el.dataset.dragParent || null) === ownParent,
      );
      const next = same[same.findIndex((el) => el === own) + 1];
      if ((next?.dataset.dragId ?? null) === target.beforeId) return;
    }
    reorder(d.row, target);
  };

  const handleProps = (row: BalanceRow, section: ConceptSection) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      scope.current = e.currentTarget.closest<HTMLElement>("[data-drag-scope]");
      lastY.current = e.clientY;
      setDrag({ row, section, target: null });
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!drag) return;
      lastY.current = e.clientY;
      const target = compute(drag, e.clientY);
      setDrag((d) => (d ? { ...d, target } : d));
    },
    onPointerUp: () => {
      if (drag) drop(drag);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
  });

  return {
    dragging: drag?.row.id ?? null,
    handleProps,
    /** Línea de «se colocará aquí» encima de esta fila, o fila resaltada si entra en el grupo. */
    indicator: (rowId: string): "before" | "into" | null =>
      drag?.target && drag.target.kind !== "end" && drag.target.rowId === rowId ? drag.target.kind : null,
    isEnd: (section: ConceptSection) => drag?.section === section && drag.target?.kind === "end",
  };
}

export type RowDrag = ReturnType<typeof useRowDrag>;

/** Asa para arrastrar la fila (y flechas del teclado para subir/bajar). */
export function DragHandle({
  row,
  section,
  drag,
  className,
}: {
  row: BalanceRow;
  section: ConceptSection;
  drag: RowDrag;
  className?: string;
}) {
  const { tab } = useBalanceEditor();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Mover ${row.name}: arrástralo arriba o abajo (o usa las flechas)`}
      title="Arrastra para colocarlo"
      disabled={busy}
      {...drag.handleProps(row, section)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        start(async () => {
          const res = await moveConcept(tab, row.id, e.key === "ArrowUp" ? "up" : "down");
          if (!res.ok) toast.error(res.error);
        });
      }}
      className={cn(
        "grid shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing disabled:opacity-50",
        drag.dragging === row.id && "cursor-grabbing text-brand",
        className,
      )}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

/** Clases de una fila según el arrastre (línea encima, grupo resaltado o la que se mueve). */
export function dropClasses(drag: RowDrag, rowId: string, table = false) {
  const ind = drag.indicator(rowId);
  return cn(
    ind === "before" && (table ? "[&>*]:shadow-[inset_0_3px_0_0_var(--color-brand)]" : "shadow-[inset_0_3px_0_0_var(--color-brand)]"),
    ind === "into" && (table ? "[&>*]:!bg-brand-soft" : "bg-brand-soft"),
    drag.dragging === rowId && "opacity-40",
  );
}

/** Clases del final del bloque cuando se va a soltar ahí. */
export function endClasses(drag: RowDrag, section: ConceptSection, table = false) {
  return drag.isEnd(section)
    ? table
      ? "[&>*]:shadow-[inset_0_3px_0_0_var(--color-brand)]"
      : "shadow-[inset_0_3px_0_0_var(--color-brand)]"
    : undefined;
}
