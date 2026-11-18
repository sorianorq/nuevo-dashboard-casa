"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, FileSpreadsheet, Plus, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate, formatSignedAmount } from "@/lib/format";
import { OWNER_LABEL, type BalanceTab, type Owner } from "@/lib/balance";
import { ACCOUNT_TYPES, type Account, type AccountType, type ConceptOption } from "@/lib/labels";
import {
  adaptTemplate,
  buildRowsFromMatrix,
  detectBestHeaderRow,
  extractRows,
  guessMapping,
  indexToColumnLetter,
  templateWithLetters,
  type ImportMapping,
  type ImportTemplate,
  type Matrix,
} from "@/lib/import/normalize";
import { readFileMatrix } from "@/lib/import/parse-file";
import {
  addAccount,
  commitImport,
  loadTemplate,
  previewImport,
  type PreviewRow,
} from "@/app/(app)/contabilidad/movimientos/actions";
import { ConceptPicker } from "./concept-picker";
import { ConceptsProvider } from "./concepts-context";

export type WizardBalance = {
  tab: BalanceTab;
  owner: Owner;
  accounts: Account[];
  concepts: ConceptOption[];
};

type Step = 1 | 2 | 3;
type Result = { inserted: number; duplicates: number; withoutConcept: number };

const selectClass = "h-11 w-full min-w-0 rounded-xl border bg-surface px-3 text-sm hover:bg-accent";

export function ImportWizard({ balances, initialTab }: { balances: WizardBalance[]; initialTab: BalanceTab }) {
  const [step, setStep] = useState<Step>(1);
  const [tab, setTab] = useState<BalanceTab>(initialTab);
  const [accountsByTab, setAccountsByTab] = useState(() =>
    Object.fromEntries(balances.map((b) => [b.tab, b.accounts])) as Record<BalanceTab, Account[]>,
  );
  const [accountId, setAccountId] = useState("");
  const [fileName, setFileName] = useState("");
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [legacyMatrix, setLegacyMatrix] = useState<Matrix | null>(null);
  const [template, setTemplate] = useState<ImportTemplate | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [editMapping, setEditMapping] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [choices, setChoices] = useState<Record<number, string | null>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const savedTemplateRef = useRef<ImportTemplate | null>(null);

  const balance = balances.find((b) => b.tab === tab)!;
  const accounts = accountsByTab[tab];
  const account = accounts.find((a) => a.id === accountId);

  const parsed = useMemo(
    () => (matrix && template ? extractRows(matrix, template, legacyMatrix) : { valid: [], invalid: [] }),
    [matrix, template, legacyMatrix],
  );
  const columns = useMemo(
    () => (matrix && template ? buildRowsFromMatrix(matrix, template.headerRow, template.dataStartRow, template.startColumn).columns : []),
    [matrix, template],
  );
  const mappingComplete = Boolean(template?.mapping.date && template.mapping.description && template.mapping.amount);
  const savedColumnsMissing =
    templateSaved && template !== null && Object.values(template.mapping).some((c) => c && !columns.includes(c));

  // --- Paso 1 ---------------------------------------------------------------

  const resetFile = () => {
    setMatrix(null);
    setLegacyMatrix(null);
    setFileName("");
    setTemplate(null);
    setTemplateSaved(false);
    setEditMapping(false);
  };

  const chooseTab = (t: BalanceTab) => {
    setTab(t);
    setAccountId("");
    resetFile();
  };

  const prepareTemplate = (m: Matrix, legacy: Matrix | null, saved: ImportTemplate | null) => {
    if (saved) {
      const cols = buildRowsFromMatrix(m, saved.headerRow, saved.dataStartRow, saved.startColumn).columns;
      const legacyCols = legacy
        ? buildRowsFromMatrix(legacy, saved.headerRow, saved.dataStartRow, saved.startColumn).columns
        : null;
      setTemplate(adaptTemplate(saved, cols, legacyCols));
      setTemplateSaved(true);
      setEditMapping(false);
      return;
    }
    const headerRow = detectBestHeaderRow(m) + 1;
    const base = { headerRow, dataStartRow: headerRow + 1, startColumn: "A" };
    const cols = buildRowsFromMatrix(m, base.headerRow, base.dataStartRow, base.startColumn).columns;
    setTemplate({ ...base, mapping: guessMapping(cols) });
    setTemplateSaved(false);
    setEditMapping(true);
  };

  const chooseAccount = (id: string) => {
    setAccountId(id);
    savedTemplateRef.current = null;
    if (!id) return;
    start(async () => {
      const res = await loadTemplate(tab, id);
      if (!res.ok) return void toast.error(res.error);
      savedTemplateRef.current = res.template;
      if (matrix) prepareTemplate(matrix, legacyMatrix, res.template);
    });
  };

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return void toast.error("El archivo es demasiado grande (máximo 10 MB).");
    start(async () => {
      try {
        const { matrix: m, legacyMatrix: legacy } = await readFileMatrix(file);
        if (!m.length) throw new Error();
        setMatrix(m);
        setLegacyMatrix(legacy);
        setFileName(file.name);
        prepareTemplate(m, legacy, savedTemplateRef.current);
      } catch {
        resetFile();
        toast.error("No se ha podido leer el archivo. Usa CSV, XLS o XLSX.");
      }
    });
  };

  const goPreview = () =>
    start(async () => {
      const res = await previewImport(tab, accountId, parsed.valid);
      if (!res.ok) return void toast.error(res.error);
      setPreview(res.rows);
      setChoices(Object.fromEntries(res.rows.map((r) => [r.line, r.suggestion?.conceptId ?? null])));
      setStep(2);
    });

  // --- Paso 2 ---------------------------------------------------------------

  const fresh = preview.filter((r) => !r.duplicate);
  const dups = preview.filter((r) => r.duplicate);
  const withoutConcept = fresh.filter((r) => !choices[r.line]).length;

  const doImport = () =>
    start(async () => {
      if (!template) return;
      const res = await commitImport(
        tab,
        accountId,
        templateWithLetters(template, columns) ?? template,
        fresh.map((r) => ({
          line: r.line,
          date: r.date,
          description: r.description,
          amount: r.amount,
          balance: r.balance,
          ...(r.legacyDescription ? { legacyDescription: r.legacyDescription } : {}),
          conceptId: choices[r.line] ?? null,
        })),
      );
      if (!res.ok) return void toast.error(res.error);
      setResult({ inserted: res.inserted, duplicates: res.duplicates + dups.length, withoutConcept: res.withoutConcept });
      setStep(3);
    });

  const restart = () => {
    setStep(1);
    setPreview([]);
    setChoices({});
    setResult(null);
    resetFile();
    if (accountId) chooseAccount(accountId);
  };

  return (
    <div className="space-y-5">
      <Stepper step={step} />

      {step === 1 && (
        <div className="space-y-4">
          <Card title="Balance y cuenta">
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-1.5 text-xs font-bold text-muted-foreground">Balance</legend>
                <div className="flex max-w-md gap-1 rounded-2xl bg-track p-1">
                  {balances.map((b) => (
                    <button
                      key={b.tab}
                      type="button"
                      aria-pressed={tab === b.tab}
                      onClick={() => chooseTab(b.tab)}
                      className={cn(
                        "min-h-11 flex-1 rounded-xl text-sm",
                        tab === b.tab ? "bg-surface font-bold shadow-sm" : "font-semibold text-muted-foreground",
                      )}
                    >
                      {OWNER_LABEL[b.owner]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                  <label htmlFor="import-account" className="text-xs font-bold text-muted-foreground">
                    Cuenta
                  </label>
                  <select
                    id="import-account"
                    className={selectClass}
                    value={accountId}
                    onChange={(e) => chooseAccount(e.target.value)}
                  >
                    <option value="">Elige una cuenta…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.bank ? ` · ${a.bank}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <NewAccount
                  tab={tab}
                  onCreated={(a) => {
                    setAccountsByTab((prev) => ({ ...prev, [tab]: [...prev[tab], a] }));
                    chooseAccount(a.id);
                  }}
                />
              </div>
              {accounts.length === 0 && (
                <p className="text-xs text-muted-foreground">Este Balance aún no tiene cuentas: crea una.</p>
              )}
            </div>
          </Card>

          <Card title="Archivo">
            <label
              className={cn(
                "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-surface px-4 py-6 text-center transition-colors hover:bg-accent",
                !accountId && "pointer-events-none opacity-50",
              )}
            >
              {fileName ? (
                <FileSpreadsheet className="size-6 text-brand" aria-hidden />
              ) : (
                <Upload className="size-6 text-brand" aria-hidden />
              )}
              <span className="font-semibold">{fileName || "Elegir archivo"}</span>
              <span className="text-xs text-muted-foreground">
                {accountId ? "CSV, XLS o XLSX del banco. Se lee en tu dispositivo." : "Elige antes la cuenta."}
              </span>
              <input
                type="file"
                className="sr-only"
                accept=".csv,.xls,.xlsx,.html,.htm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={!accountId}
                onChange={(e) => {
                  chooseFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </Card>

          {matrix && template && (
            <Card
              title="Columnas"
              action={
                templateSaved && !editMapping ? (
                  <button type="button" onClick={() => setEditMapping(true)} className="min-h-11 text-xs font-semibold text-brand hover:underline">
                    Cambiar
                  </button>
                ) : null
              }
            >
              {templateSaved && !editMapping && !savedColumnsMissing ? (
                <p className="text-sm">
                  Plantilla guardada para <span className="font-bold">{account?.name}</span>: fecha «{template.mapping.date}»,
                  descripción «{template.mapping.description}», importe «{template.mapping.amount}».
                </p>
              ) : (
                <MappingEditor
                  matrix={matrix}
                  template={template}
                  columns={columns}
                  onChange={setTemplate}
                  warning={savedColumnsMissing ? "La plantilla guardada no coincide con este archivo: revisa las columnas." : null}
                />
              )}
              <ParsedPreview valid={parsed.valid.slice(0, 5)} total={parsed.valid.length} invalid={parsed.invalid.length} />
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              disabled={pending || !accountId || !mappingComplete || parsed.valid.length === 0}
              onClick={goPreview}
            >
              {pending ? "Comprobando…" : parsed.valid.length ? `Continuar con ${parsed.valid.length} movimientos` : "Continuar"}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <ConceptsProvider key={tab} tab={tab} initial={balance.concepts}>
          <div className="space-y-4">
            <Counts fresh={fresh.length} dups={dups.length} withoutConcept={withoutConcept} />
            {fresh.length > 0 ? (
              <PreviewTable rows={fresh} choices={choices} onChoose={(line, id) => setChoices((c) => ({ ...c, [line]: id }))} />
            ) : (
              <p className="rounded-card border bg-card px-6 py-10 text-center text-muted-foreground">
                Todos los movimientos del archivo ya estaban importados.
              </p>
            )}
            {dups.length > 0 && (
              <details className="rounded-card border bg-card px-4 py-1">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
                  {dups.length} duplicados (no se importan)
                </summary>
                <ul className="divide-y pb-2 text-sm">
                  {dups.map((r) => (
                    <li key={r.line} className="flex items-center justify-between gap-3 py-2 text-muted-foreground">
                      <span className="min-w-0">
                        <span className="block truncate">{r.description}</span>
                        <span className="text-xs">
                          {formatDate(r.date)} · {r.duplicate === "db" ? "ya importado" : "repetido en el archivo"}
                        </span>
                      </span>
                      <span className="amount">{formatSignedAmount(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="outline" disabled={pending} onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button size="lg" disabled={pending || fresh.length === 0} onClick={doImport}>
                {pending ? "Importando…" : `Importar ${fresh.length} movimientos`}
              </Button>
            </div>
          </div>
        </ConceptsProvider>
      )}

      {step === 3 && result && (
        <div className="rounded-card border bg-card px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto size-10 text-positive" aria-hidden />
          <p className="mt-3 text-[20px] font-extrabold">Extracto cargado</p>
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            <span className="font-bold text-foreground">{result.inserted}</span> nuevos ·{" "}
            <span className="font-bold text-foreground">{result.duplicates}</span> duplicados ·{" "}
            <span className="font-bold text-foreground">{result.withoutConcept}</span> sin concepto
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {OWNER_LABEL[balance.owner]} · {account?.name}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link
              href={`/contabilidad/movimientos${tab === "personal" ? "?balance=personal" : ""}`}
              className={buttonVariants()}
            >
              Ver movimientos
            </Link>
            {result.withoutConcept > 0 && (
              <Link
                href={`/contabilidad/movimientos/revisar${tab === "personal" ? "?balance=personal" : ""}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Revisar sin concepto
              </Link>
            )}
            <Button variant="ghost" onClick={restart}>
              Cargar otro
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Piezas -----------------------------------------------------------------

function Stepper({ step }: { step: Step }) {
  const steps = ["Archivo", "Revisar", "Hecho"];
  return (
    <ol className="flex gap-2" aria-label="Pasos">
      {steps.map((s, i) => {
        const n = (i + 1) as Step;
        const state = n < step ? "done" : n === step ? "current" : "todo";
        return (
          <li
            key={s}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-xs",
              state === "current" ? "border-brand bg-brand-soft font-bold" : "bg-card text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                state === "todo" ? "bg-track" : "bg-brand text-primary-foreground",
              )}
            >
              {state === "done" ? "✓" : n}
            </span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-card border bg-card p-4 lg:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function NewAccount({ tab, onCreated }: { tab: BalanceTab; onCreated: (a: Account) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [type, setType] = useState<AccountType>("personal");
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Nueva cuenta
      </Button>
    );
  }
  return (
    <form
      className="grid gap-2 rounded-2xl border bg-surface p-3 sm:col-span-2 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addAccount(tab, { name, bank, accountType: type });
          if (!res.ok) return void toast.error(res.error);
          toast.success(`Cuenta «${res.account.name}» creada`);
          onCreated(res.account);
          setOpen(false);
          setName("");
          setBank("");
        });
      }}
    >
      <Input aria-label="Nombre de la cuenta" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      <Input aria-label="Banco" placeholder="Banco" value={bank} onChange={(e) => setBank(e.target.value)} maxLength={80} />
      <select aria-label="Tipo de cuenta" className={selectClass} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
        {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => (
          <option key={t} value={t}>
            {ACCOUNT_TYPES[t]}
          </option>
        ))}
      </select>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Creando…" : "Crear cuenta"}
        </Button>
      </div>
    </form>
  );
}

function MappingEditor({
  matrix,
  template,
  columns,
  onChange,
  warning,
}: {
  matrix: Matrix;
  template: ImportTemplate;
  columns: string[];
  onChange: (t: ImportTemplate) => void;
  warning: string | null;
}) {
  const maxCols = Math.max(...matrix.slice(0, 40).map((r) => r.length), 1);
  const setMap = (key: keyof ImportMapping, v: string) =>
    onChange({ ...template, mapping: { ...template.mapping, [key]: v || null } });
  const setNum = (key: "headerRow" | "dataStartRow", v: string) => {
    const n = Math.max(1, Math.min(matrix.length, Math.floor(Number(v)) || 1));
    onChange({ ...template, [key]: n, ...(key === "headerRow" && template.dataStartRow <= n ? { dataStartRow: n + 1 } : {}) });
  };
  const fields: { key: keyof ImportMapping; label: string; required: boolean }[] = [
    { key: "date", label: "Fecha", required: true },
    { key: "description", label: "Descripción", required: true },
    { key: "amount", label: "Importe", required: true },
    { key: "balance", label: "Saldo", required: false },
  ];

  return (
    <div className="space-y-4">
      {warning && <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-warning">{warning}</p>}
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Fila de cabecera" value={template.headerRow} onChange={(v) => setNum("headerRow", v)} />
        <NumberField label="Primera fila de datos" value={template.dataStartRow} onChange={(v) => setNum("dataStartRow", v)} />
        <div className="space-y-1">
          <label htmlFor="map-startcol" className="text-xs font-bold text-muted-foreground">Columna inicial</label>
          <select
            id="map-startcol"
            className={selectClass}
            value={template.startColumn}
            onChange={(e) => onChange({ ...template, startColumn: e.target.value })}
          >
            {Array.from({ length: maxCols }, (_, i) => indexToColumnLetter(i)).map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label htmlFor={`map-${f.key}`} className="text-xs font-bold text-muted-foreground">
              {f.label}
              {!f.required && " (opcional)"}
            </label>
            <select
              id={`map-${f.key}`}
              className={selectClass}
              value={template.mapping[f.key] ?? ""}
              onChange={(e) => setMap(f.key, e.target.value)}
              aria-invalid={f.required && !template.mapping[f.key] ? true : undefined}
            >
              <option value="">{f.required ? "Elige columna…" : "Ninguna"}</option>
              {columns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Ver las primeras filas del archivo
        </summary>
        <div className="max-h-64 overflow-auto rounded-xl border">
          <table className="text-xs">
            <tbody>
              {matrix.slice(0, 25).map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b last:border-0",
                    i + 1 === template.headerRow && "bg-brand-soft font-bold",
                  )}
                >
                  <th scope="row" className="sticky left-0 bg-surface px-2 py-1 text-right font-semibold text-muted-foreground">
                    {i + 1}
                  </th>
                  {row.map((cell, j) => (
                    <td key={j} className="max-w-48 truncate px-2 py-1 whitespace-nowrap">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  const id = `num-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-bold text-muted-foreground">{label}</label>
      <Input id={id} type="number" inputMode="numeric" min={1} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ParsedPreview({
  valid,
  total,
  invalid,
}: {
  valid: { line: number; date: string; description: string; amount: number }[];
  total: number;
  invalid: number;
}) {
  return (
    <div className="mt-4 border-t pt-4">
      <p className="mb-2 text-xs text-muted-foreground">
        <span className="font-bold text-foreground">{total}</span> movimientos leídos
        {invalid > 0 && <span> · {invalid} filas descartadas (sin fecha, descripción o importe)</span>}
      </p>
      {valid.length > 0 ? (
        <ul className="divide-y rounded-xl border text-sm">
          {valid.map((r) => (
            <li key={r.line} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.description}</span>
                <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>
              </span>
              <span className={cn("amount font-semibold", r.amount > 0 && "text-positive")}>{formatSignedAmount(r.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-warning">Con estas columnas no sale ningún movimiento válido.</p>
      )}
    </div>
  );
}

function Counts({ fresh, dups, withoutConcept }: { fresh: number; dups: number; withoutConcept: number }) {
  return (
    <p className="flex flex-wrap gap-2 text-sm" role="status">
      <Chip value={fresh} label="nuevos" />
      <Chip value={dups} label="duplicados" />
      <Chip value={withoutConcept} label="sin concepto" warn={withoutConcept > 0} />
    </p>
  );
}

function Chip({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <span className={cn("rounded-xl border bg-card px-3 py-2", warn && "border-warning/40")}>
      <span className={cn("font-extrabold tabular-nums", warn && "text-warning")}>{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function PreviewTable({
  rows,
  choices,
  onChoose,
}: {
  rows: PreviewRow[];
  choices: Record<number, string | null>;
  onChoose: (line: number, id: string | null) => void;
}) {
  const hint = (r: PreviewRow) =>
    r.suggestion && choices[r.line] === r.suggestion.conceptId
      ? r.suggestion.source === "exact"
        ? "sugerido"
        : "parecido"
      : undefined;

  return (
    <div className="rounded-card border bg-card">
      <ul className="divide-y lg:hidden">
        {rows.map((r) => (
          <li key={r.line} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold break-words">{r.description}</span>
                <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>
              </span>
              <span className={cn("amount font-bold", r.amount > 0 && "text-positive")}>{formatSignedAmount(r.amount)}</span>
            </div>
            <ConceptPicker
              value={choices[r.line] ?? null}
              hint={hint(r)}
              defaultSection={r.amount > 0 ? "ingresos" : "gastos"}
              label={`Concepto de ${r.description}`}
              onChange={(id) => onChoose(r.line, id)}
            />
          </li>
        ))}
      </ul>
      <table className="hidden w-full table-fixed text-sm lg:table">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-[104px] px-4 py-3 text-left font-semibold">Fecha</th>
            <th scope="col" className="px-3 py-3 text-left font-semibold">Descripción</th>
            <th scope="col" className="w-[136px] px-3 py-3 text-right font-semibold">Importe</th>
            <th scope="col" className="w-[280px] px-3 py-3 text-left font-semibold">Concepto</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.line}>
              <td className="px-4 py-2 tabular-nums">{formatDate(r.date)}</td>
              <td className="px-3 py-2">
                <span className="block truncate" title={r.description}>{r.description}</span>
              </td>
              <td className="px-3 py-2">
                <span className={cn("amount block font-bold", r.amount > 0 && "text-positive")}>{formatSignedAmount(r.amount)}</span>
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  {hint(r) && <Sparkles className="size-4 shrink-0 text-brand" aria-hidden />}
                  <ConceptPicker
                    value={choices[r.line] ?? null}
                    hint={hint(r)}
                    defaultSection={r.amount > 0 ? "ingresos" : "gastos"}
                    label={`Concepto de ${r.description}`}
                    onChange={(id) => onChoose(r.line, id)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
