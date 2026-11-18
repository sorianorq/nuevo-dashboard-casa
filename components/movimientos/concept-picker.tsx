"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SECTION_LABEL, SECTION_ORDER, type ConceptSection } from "@/lib/labels";
import { newConcept } from "@/app/(app)/movimientos/actions";
import { useConcepts } from "./concepts-context";

/**
 * Desplegable de concepto con buscador: conceptos del Balance agrupados por
 * bloque, «Sin concepto» y «+ Nuevo concepto».
 */
export function ConceptPicker({
  value,
  onChange,
  disabled,
  label = "Concepto",
  hint,
  className,
  defaultSection = "gastos",
}: {
  value: string | null;
  onChange: (conceptId: string | null) => void;
  disabled?: boolean;
  label?: string;
  /** Texto pequeño junto al valor (p. ej. «sugerido»). */
  hint?: string;
  className?: string;
  defaultSection?: ConceptSection;
}) {
  const { concepts, byId, add, tab } = useConcepts();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const selected = value ? byId.get(value) : undefined;

  const pick = (id: string | null) => {
    setOpen(false);
    setCreating(false);
    if (id !== value) onChange(id);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setCreating(false);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label={`${label}: ${selected?.name ?? "sin concepto"}`}
        className={cn(
          "flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-surface px-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60",
          !selected && "text-muted-foreground",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          {selected ? selected.name : "Sin concepto"}
          {hint && selected && <span className="ml-1.5 text-[11px] font-semibold text-brand">{hint}</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
        {creating ? (
          <NewConceptForm
            tab={tab}
            initialName={query}
            defaultSection={defaultSection}
            onCancel={() => setCreating(false)}
            onCreated={(c) => {
              add(c);
              pick(c.id);
            }}
          />
        ) : (
          <Command>
            <CommandInput placeholder="Buscar concepto…" value={query} onValueChange={setQuery} />
            <CommandList className="max-h-72">
              <CommandEmpty>No hay conceptos con ese nombre.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="Sin concepto __none" onSelect={() => pick(null)} className="min-h-11">
                  <span className="text-muted-foreground">Sin concepto</span>
                  {value === null && <Check className="ml-auto size-4" aria-hidden />}
                </CommandItem>
              </CommandGroup>
              {SECTION_ORDER.map((section) => {
                const items = concepts.filter((c) => c.section === section);
                if (!items.length) return null;
                return (
                  <CommandGroup key={section} heading={SECTION_LABEL[section]}>
                    {items.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.name} ${c.parentName ?? ""} ${c.id}`}
                        onSelect={() => pick(c.id)}
                        className="min-h-11"
                      >
                        <span className="min-w-0 truncate">{c.name}</span>
                        {c.parentName && (
                          <span className="shrink-0 text-xs text-muted-foreground">{c.parentName}</span>
                        )}
                        {value === c.id && <Check className="ml-auto size-4 shrink-0" aria-hidden />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
              <CommandSeparator alwaysRender />
              {/* Siempre visible: al buscar un nombre que no existe es cuando más hace falta. */}
              <CommandGroup forceMount>
                <CommandItem forceMount value="__new" onSelect={() => setCreating(true)} className="min-h-11 font-semibold text-brand">
                  <Plus className="size-4" aria-hidden />
                  {query.trim() ? `Nuevo concepto «${query.trim()}»` : "Nuevo concepto"}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NewConceptForm({
  tab,
  initialName,
  defaultSection,
  onCancel,
  onCreated,
}: {
  tab: string;
  initialName: string;
  defaultSection: ConceptSection;
  onCancel: () => void;
  onCreated: (c: { id: string; name: string; section: ConceptSection; parentName: string | null }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [section, setSection] = useState<ConceptSection>(defaultSection);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await newConcept(tab, name, section);
          if (res.ok) {
            toast.success(`Concepto «${res.concept.name}» listo`);
            onCreated(res.concept);
          } else toast.error(res.error);
        });
      }}
    >
      <p className="text-sm font-bold">Nuevo concepto</p>
      <div className="space-y-1">
        <label htmlFor="new-concept-name" className="text-xs font-semibold text-muted-foreground">
          Nombre
        </label>
        <Input id="new-concept-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs font-semibold text-muted-foreground">Bloque</legend>
        <div className="flex gap-1 rounded-xl bg-track p-1">
          {SECTION_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={section === s}
              onClick={() => setSection(s)}
              className={cn(
                "min-h-10 flex-1 rounded-lg text-xs",
                section === s ? "bg-surface font-bold shadow-sm" : "font-semibold text-muted-foreground",
              )}
            >
              {SECTION_LABEL[s]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Creando…" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
