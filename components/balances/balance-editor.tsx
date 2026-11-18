"use client";

import Link from "next/link";
import { createContext, useContext, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Eye, EyeOff, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatAmount, formatMonth } from "@/lib/format";
import type { BalanceRow, LinkSource } from "@/lib/calc/balance";
import {
  LINK_SOURCE_LABEL,
  PERIODICITIES,
  PERIODICITY_LABEL,
  SECTION_LABEL,
  SECTION_ORDER,
  type ConceptSection,
  type Periodicity,
} from "@/lib/labels";
import {
  addConcept,
  archiveConcept,
  editConcept,
  hideConcept,
  moveConcept,
  saveCell,
} from "@/app/(app)/contabilidad/balances/actions";

type Group = { id: string; name: string; section: ConceptSection };

type EditorState = {
  tab: "casa" | "personal";
  year: number;
  monthsElapsed: number;
  groups: Group[];
  hidden: Set<string>;
  comments: Record<string, (string | null)[]>;
  openCell: (row: BalanceRow, monthIndex: number) => void;
  openNewConcept: (section?: ConceptSection) => void;
  openEditConcept: (row: BalanceRow) => void;
};

const EditorContext = createContext<EditorState | null>(null);

export function useBalanceEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useBalanceEditor fuera de BalanceEditor");
  return ctx;
}

const selectClass =
  "h-11 w-full rounded-xl border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** «1.234,56», «1234.56», «80» → número; vacío → null; texto no válido → NaN. */
export function parseAmount(raw: string): number | null {
  const clean = raw.replace(/[\s€]/g, "").replace(/−/g, "-");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

const toInput = (v: number | null) =>
  v === null ? "" : v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false });

/**
 * Proveedor de la edición del Balance: ventana de celda (importe a mano y
 * comentario) y ventana de concepto (alta y edición).
 */
export function BalanceEditor({
  tab,
  year,
  monthsElapsed,
  groups,
  hidden,
  comments,
  children,
}: {
  tab: "casa" | "personal";
  year: number;
  monthsElapsed: number;
  groups: Group[];
  hidden: string[];
  comments: Record<string, (string | null)[]>;
  children: React.ReactNode;
}) {
  const [cell, setCell] = useState<{ row: BalanceRow; monthIndex: number } | null>(null);
  const [concept, setConcept] = useState<{ mode: "new"; section: ConceptSection } | { mode: "edit"; row: BalanceRow } | null>(null);

  const value: EditorState = {
    tab,
    year,
    monthsElapsed,
    groups,
    hidden: new Set(hidden),
    comments,
    openCell: (row, monthIndex) => setCell({ row, monthIndex }),
    openNewConcept: (section = "gastos") => setConcept({ mode: "new", section }),
    openEditConcept: (row) => setConcept({ mode: "edit", row }),
  };

  return (
    <EditorContext.Provider value={value}>
      {children}
      {cell && (
        <CellDialog
          key={`${cell.row.id}-${cell.monthIndex}`}
          row={cell.row}
          monthIndex={cell.monthIndex}
          onClose={() => setCell(null)}
        />
      )}
      {concept && (
        <ConceptDialog
          key={concept.mode === "edit" ? concept.row.id : `new-${concept.section}`}
          state={concept}
          onClose={() => setConcept(null)}
        />
      )}
    </EditorContext.Provider>
  );
}

function CellDialog({ row, monthIndex, onClose }: { row: BalanceRow; monthIndex: number; onClose: () => void }) {
  const { tab, year, monthsElapsed, comments } = useBalanceEditor();
  const [amount, setAmount] = useState(toInput(row.manual[monthIndex]));
  const [comment, setComment] = useState(comments[row.id]?.[monthIndex] ?? "");
  const [pending, start] = useTransition();
  const linked = row.kind === "linked";
  const automatic = row.automatic[monthIndex];
  const movementsHref =
    linked && row.linkSource === "movimientos" && monthIndex < monthsElapsed
      ? `/movimientos?${new URLSearchParams({
          mes: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
          concepto: row.id,
          ...(tab === "personal" ? { balance: "personal" } : {}),
        })}`
      : null;

  const parsed = parseAmount(amount);
  const invalid = Number.isNaN(parsed);

  const save = () =>
    start(async () => {
      const res = await saveCell(tab, { conceptId: row.id, year, month: monthIndex + 1, amount: parsed, comment });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Guardado");
      onClose();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {row.name} · {formatMonth(year, monthIndex + 1)}
          </DialogTitle>
          <DialogDescription>
            {linked
              ? `Automático desde ${LINK_SOURCE_LABEL[row.linkSource ?? "movimientos"].toLowerCase()}${row.linkSource === "pagos" ? "" : " y los gastos apuntados a mano con este concepto"}. Un importe escrito a mano manda sobre él.`
              : "Concepto manual: el importe se escribe a mano."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="cell-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) save();
          }}
        >
          {linked && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-track/60 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Automático</span>
              <span className="flex items-center gap-3">
                <span className="font-bold tabular-nums">{automatic === null ? "—" : formatAmount(automatic)}</span>
                {movementsHref && (
                  <Link href={movementsHref} className="min-h-11 content-center text-xs font-semibold text-brand hover:underline">
                    Ver movimientos
                  </Link>
                )}
              </span>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="cell-amount" className="text-xs font-bold text-muted-foreground">
              {linked ? "Importe escrito a mano (opcional)" : "Importe"}
            </label>
            <Input
              id="cell-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder={linked ? "Vacío = usar el automático" : "0,00"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "cell-amount-error" : undefined}
              className="h-11 text-right tabular-nums"
              autoFocus
            />
            {invalid && (
              <p id="cell-amount-error" className="text-xs font-semibold text-warning">
                Escribe un importe como 1.234,56
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cell-comment" className="text-xs font-bold text-muted-foreground">
              Comentario
            </label>
            <Textarea
              id="cell-comment"
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Nota para esta celda"
              rows={3}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="cell-form" disabled={pending || invalid}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConceptDialog({
  state,
  onClose,
}: {
  state: { mode: "new"; section: ConceptSection } | { mode: "edit"; row: BalanceRow };
  onClose: () => void;
}) {
  const { tab, year, groups } = useBalanceEditor();
  const editing = state.mode === "edit" ? state.row : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [section, setSection] = useState<ConceptSection>(state.mode === "new" ? state.section : state.row.section);
  const [parentId, setParentId] = useState("");
  const [kind, setKind] = useState<"manual" | "linked">("linked");
  const [source, setSource] = useState<LinkSource>("movimientos");
  const initialPeriodicity = (PERIODICITIES as readonly string[]).includes(editing?.periodicity ?? "")
    ? (editing?.periodicity as Periodicity)
    : "";
  const [periodicity, setPeriodicity] = useState<Periodicity | "">(initialPeriodicity);
  const [fill, setFill] = useState("");
  const [pending, start] = useTransition();

  const fillAmount = parseAmount(fill);
  const invalid = !name.trim() || (kind === "manual" && Number.isNaN(fillAmount));
  const sectionGroups = groups.filter((g) => g.section === section);

  const submit = () =>
    start(async () => {
      const res = editing
        ? await editConcept(tab, editing.id, { name, periodicity: periodicity || null })
        : await addConcept(tab, {
            name,
            section,
            kind,
            linkSource: kind === "linked" ? source : null,
            parentId: parentId || null,
            periodicity: periodicity || null,
            fillAmount: kind === "manual" ? fillAmount : null,
            fillYear: year,
          });
      if (!res.ok) return void toast.error(res.error);
      toast.success(editing ? "Concepto actualizado" : "Concepto creado");
      onClose();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar «${editing.name}»` : "Nuevo concepto"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "El nombre cambia en todas partes, también en los importes y comentarios guardados."
              : "Se añade al catálogo de este Balance."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="concept-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) submit();
          }}
        >
          <Field label="Nombre" htmlFor="concept-name">
            <Input id="concept-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-11" autoFocus />
          </Field>
          {!editing && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bloque" htmlFor="concept-section">
                  <select
                    id="concept-section"
                    className={selectClass}
                    value={section}
                    onChange={(e) => {
                      setSection(e.target.value as ConceptSection);
                      setParentId("");
                    }}
                  >
                    {SECTION_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {SECTION_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Dentro de (opcional)" htmlFor="concept-parent">
                  <select
                    id="concept-parent"
                    className={selectClass}
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    disabled={sectionGroups.length === 0}
                  >
                    <option value="">Ninguno</option>
                    {sectionGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-xs font-bold text-muted-foreground">Tipo</legend>
                <div className="flex gap-1 rounded-2xl bg-track p-1">
                  {(["linked", "manual"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      onClick={() => setKind(k)}
                      className={cn(
                        "min-h-11 flex-1 rounded-xl text-sm",
                        kind === k ? "bg-surface font-bold shadow-sm" : "font-semibold text-muted-foreground",
                      )}
                    >
                      {k === "linked" ? "Automático" : "Manual"}
                    </button>
                  ))}
                </div>
              </fieldset>
              {kind === "linked" ? (
                <Field label="Sale de" htmlFor="concept-source">
                  <select
                    id="concept-source"
                    className={selectClass}
                    value={source}
                    onChange={(e) => setSource(e.target.value as LinkSource)}
                  >
                    {(Object.keys(LINK_SOURCE_LABEL) as LinkSource[]).map((s) => (
                      <option key={s} value={s}>
                        {LINK_SOURCE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label={`Importe para rellenar los 12 meses de ${year} (opcional)`} htmlFor="concept-fill">
                  <Input
                    id="concept-fill"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    value={fill}
                    onChange={(e) => setFill(e.target.value)}
                    aria-invalid={Number.isNaN(fillAmount)}
                    className="h-11 text-right tabular-nums"
                  />
                </Field>
              )}
            </>
          )}
          <Field label="Periodicidad (opcional)" htmlFor="concept-periodicity">
            <select
              id="concept-periodicity"
              className={selectClass}
              value={periodicity}
              onChange={(e) => setPeriodicity(e.target.value as Periodicity | "")}
            >
              <option value="">Sin indicar</option>
              {PERIODICITIES.map((p) => (
                <option key={p} value={p}>
                  {PERIODICITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="concept-form" disabled={pending || invalid}>
            {pending ? "Guardando…" : editing ? "Guardar" : "Crear concepto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Menú «⋯» de un concepto: editar, subir/bajar, ocultar, archivar. */
export function ConceptMenu({ row, className }: { row: BalanceRow; className?: string }) {
  const { tab, hidden, openEditConcept } = useBalanceEditor();
  const [pending, start] = useTransition();
  const isHidden = hidden.has(row.id);

  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      if (done) toast.success(done);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Opciones de ${row.name}`}
        disabled={pending}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50",
          className,
        )}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuItem onClick={() => openEditConcept(row)}>
          <Pencil aria-hidden /> Editar…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => act(() => moveConcept(tab, row.id, "up"))}>
          <ArrowUp aria-hidden /> Subir
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => act(() => moveConcept(tab, row.id, "down"))}>
          <ArrowDown aria-hidden /> Bajar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => act(() => hideConcept(tab, row.id, !isHidden), isHidden ? "Fila visible" : "Fila oculta (sigue sumando)")}>
          {isHidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />} {isHidden ? "Mostrar" : "Ocultar"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            act(
              () => archiveConcept(tab, row.id, !row.archived),
              row.archived ? "Concepto recuperado" : "Concepto archivado: su histórico se conserva",
            )
          }
        >
          {row.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />} {row.archived ? "Recuperar" : "Archivar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AddConceptButton({ section, variant = "row" }: { section?: ConceptSection; variant?: "row" | "primary" }) {
  const { openNewConcept } = useBalanceEditor();
  return variant === "primary" ? (
    <Button onClick={() => openNewConcept(section)} className="h-11 rounded-xl px-4">
      <Plus aria-hidden /> Concepto
    </Button>
  ) : (
    <button
      type="button"
      onClick={() => openNewConcept(section)}
      className="flex min-h-11 items-center gap-1 text-[13px] font-bold text-brand hover:underline"
    >
      <Plus className="size-4" aria-hidden /> Añadir
    </button>
  );
}
