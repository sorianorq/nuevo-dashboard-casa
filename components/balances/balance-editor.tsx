"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Eye, EyeOff, Keyboard, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { applyCellEdits, type BalanceRow, type BalanceSheet, type LinkSource } from "@/lib/calc/balance";
import {
  LINK_SOURCE_LABEL,
  PERIODICITIES,
  PERIODICITY_LABEL,
  SECTION_LABEL,
  SECTION_ORDER,
  type ConceptSection,
} from "@/lib/labels";
import {
  addConcept,
  archiveConcept,
  deleteConcept,
  editConcept,
  hideConcept,
  moveConcept,
  previewDelete,
  saveBudgetCell,
  saveCell,
  saveConceptNote,
} from "@/app/(app)/contabilidad/balances/actions";
import type { DeletePreview } from "@/lib/data/balance-edit";

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
  /** Modo manual: las celdas son casillas para escribir. */
  manual: boolean;
  setManual: (on: boolean) => void;
  edits: CellEdit[];
  /** Guarda lo escrito en una celda (y lo muestra ya, con los totales recalculados). */
  saveManualCell: (row: BalanceRow, monthIndex: number, field: "real" | "budget", value: number | null) => void;
};

type CellEdit = { rowId: string; month: number; field: "real" | "budget"; value: number | null };

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
  const [manual, setManual] = useState(false);
  const [edits, setEdits] = useState<CellEdit[]>([]);

  const saveManualCell: EditorState["saveManualCell"] = (row, monthIndex, field, value) => {
    const edit: CellEdit = { rowId: row.id, month: monthIndex, field, value };
    const same = (e: CellEdit) => e.rowId === edit.rowId && e.month === edit.month && e.field === edit.field;
    setEdits((prev) => [...prev.filter((e) => !same(e)), edit]);
    void (async () => {
      const res =
        field === "real"
          ? await saveCell(tab, { conceptId: row.id, year, month: monthIndex + 1, amount: value, comment: comments[row.id]?.[monthIndex] ?? "" })
          : await saveBudgetCell(tab, { conceptId: row.id, year, month: monthIndex + 1, amount: value });
      if (!res.ok) toast.error(`${row.name}: ${res.error}`);
      // Llega la hoja guardada (refresh): se quita la edición local.
      setEdits((prev) => prev.filter((e) => !(same(e) && e.value === value)));
    })();
  };

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
    manual,
    setManual,
    edits,
    saveManualCell,
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
  const [periodicity, setPeriodicity] = useState(editing?.periodicity ?? "");
  const [fill, setFill] = useState("");
  const [pending, start] = useTransition();

  const fillAmount = parseAmount(fill);
  const invalid = !name.trim() || (kind === "manual" && Number.isNaN(fillAmount));
  const sectionGroups = groups.filter((g) => g.section === section);

  const submit = () =>
    start(async () => {
      const res = editing
        ? await editConcept(tab, editing.id, { name, periodicity: periodicity.trim() })
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
          <Field label="Periodicidad o nota (opcional)" htmlFor="concept-periodicity">
            <Input
              id="concept-periodicity"
              list="concept-periodicity-options"
              placeholder="Ej.: Mensual, Día 5 c/mes…"
              value={periodicity}
              maxLength={60}
              onChange={(e) => setPeriodicity(e.target.value)}
              className="h-11"
            />
            <datalist id="concept-periodicity-options">
              {PERIODICITIES.map((p) => (
                <option key={p} value={PERIODICITY_LABEL[p]} />
              ))}
            </datalist>
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

/** Texto «12 movimientos, 3 importes escritos…» de lo que se mueve. */
function describeCounts(c: DeletePreview["counts"]) {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => n > 0 && parts.push(n === 1 ? `1 ${one}` : `${n} ${many}`);
  add(c.transactions, "movimiento del banco", "movimientos del banco");
  add(c.manual, "gasto apuntado a mano", "gastos apuntados a mano");
  add(c.amounts, "importe escrito", "importes escritos");
  add(c.comments, "comentario", "comentarios");
  add(c.budgets, "partida de presupuesto", "partidas de presupuesto");
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : (parts[0] ?? "");
}

/**
 * Icono de borrar a la izquierda de cada concepto. Antes de borrar avisa de
 * adónde va lo que tiene asignado (su «Otros») o, en un subtotal, de que sus
 * conceptos quedan sueltos.
 */
export function DeleteConceptButton({ row, className }: { row: BalanceRow; className?: string }) {
  const { tab } = useBalanceEditor();
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [pending, start] = useTransition();

  const ask = () =>
    start(async () => {
      const res = await previewDelete(tab, row.id);
      if (!res.ok) return void toast.error(res.error);
      setPreview(res.preview);
    });
  const confirm = () =>
    start(async () => {
      const res = await deleteConcept(tab, row.id);
      if (!res.ok) return void toast.error(res.error);
      setPreview(null);
      toast.success(res.target ? `Concepto borrado: lo asignado pasa a «${res.target}»` : "Subtotal borrado");
    });

  const what = preview ? describeCounts(preview.counts) : "";
  return (
    <>
      <button
        type="button"
        onClick={ask}
        disabled={pending}
        aria-label={`Borrar el concepto ${row.name}`}
        title="Borrar concepto"
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground/70 hover:bg-accent hover:text-destructive disabled:opacity-50",
          className,
        )}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
      {preview && (
        <Dialog open onOpenChange={(o) => !o && !pending && setPreview(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Borrar «{preview.name}»?</DialogTitle>
              <DialogDescription>
                {preview.subtotal
                  ? preview.children
                    ? `Es un subtotal: sus ${preview.children === 1 ? "1 concepto queda" : `${preview.children} conceptos quedan`} sueltos en el bloque, con todo lo que tienen.`
                    : "Es un subtotal vacío."
                  : what
                    ? `Tiene ${what}. Todo pasa a «${preview.target}»${preview.createTarget ? " (se crea, porque no existe)" : ""}; si ya tiene importe ese mes, se suman.`
                    : "No tiene nada asignado."}{" "}
                No se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={() => setPreview(null)} className="h-11">
                Cancelar
              </Button>
              <Button variant="destructive" disabled={pending} onClick={confirm} className="h-11">
                {pending ? "Borrando…" : "Borrar concepto"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Hoja con lo que se acaba de escribir en modo manual (totales recalculados al momento). */
export function useDisplaySheet(sheet: BalanceSheet): BalanceSheet {
  const { edits } = useBalanceEditor();
  return useMemo(() => applyCellEdits(sheet, edits), [sheet, edits]);
}

/** Icono para entrar y salir del modo manual. */
export function ManualModeButton() {
  const { manual, setManual } = useBalanceEditor();
  return (
    <Button
      type="button"
      variant={manual ? "default" : "outline"}
      aria-pressed={manual}
      onClick={() => setManual(!manual)}
      title={manual ? "Salir del modo manual" : "Modo manual: escribir los importes en la tabla"}
      className="h-11 rounded-xl px-3"
    >
      <Keyboard aria-hidden />
      <span>{manual ? "Modo manual: activado" : "Modo manual"}</span>
    </Button>
  );
}

const toCellInput = (v: number | null) =>
  v === null ? "" : v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false });

/**
 * Casilla de una celda en modo manual. Se guarda al salir de ella o con
 * Intro; vacía = quitar lo escrito (vuelve el automático) o la partida.
 */
export function ManualCellInput({
  row,
  monthIndex,
  field,
  value,
  label,
  className,
}: {
  row: BalanceRow;
  monthIndex: number;
  field: "real" | "budget";
  value: number | null;
  label: string;
  className?: string;
}) {
  const { saveManualCell } = useBalanceEditor();
  const [text, setText] = useState(toCellInput(value));
  const [shown, setShown] = useState(value);
  // Si llega otro valor (guardado, o cambio de año), se muestra el nuevo.
  if (shown !== value) {
    setShown(value);
    setText(toCellInput(value));
  }
  const parsed = parseAmount(text);
  const invalid = Number.isNaN(parsed) || (field === "budget" && parsed !== null && parsed < 0);

  const commit = () => {
    if (invalid) return void toast.error(`${row.name}: importe no válido`);
    const next = parsed === null ? null : Math.round(parsed * 100) / 100;
    const current = field === "real" && !row.manualOverride[monthIndex] && row.kind === "linked" ? null : value;
    // Sin cambios: no se guarda (en un automático, escribir su mismo importe tampoco).
    if (next === value || (next === null && current === null)) return;
    saveManualCell(row, monthIndex, field, next);
  };

  return (
    <input
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(toCellInput(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "h-8 w-full min-w-0 rounded-md border bg-surface px-1.5 text-right text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
        row.manualOverride[monthIndex] && field === "real" && "border-brand/50",
        invalid && "border-warning",
        className,
      )}
    />
  );
}

/** Columna de texto libre de un concepto (Balance de Andrea). Se guarda al salir. */
export function ConceptNoteInput({ row }: { row: BalanceRow }) {
  const { tab } = useBalanceEditor();
  const initial = row.periodicity ?? "";
  const [text, setText] = useState(initial);
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setText(initial);
  }
  const commit = async () => {
    if (text.trim() === initial.trim()) return;
    const res = await saveConceptNote(tab, row.id, text);
    if (!res.ok) toast.error(res.error);
  };
  return (
    <input
      aria-label={`Nota de ${row.name}`}
      value={text}
      maxLength={60}
      placeholder="—"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-[12px] text-muted-foreground outline-none hover:border-border focus-visible:border-border focus-visible:bg-surface focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
