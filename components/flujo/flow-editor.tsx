"use client";

import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addEdge,
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { ArrowRightLeft, Check, GripHorizontal, Loader2, Maximize, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseAmount } from "@/components/balances/balance-editor";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/format";
import { FLOW_KIND_LABEL, FLOW_KINDS, type FlowDoc, type FlowHandle, type FlowKind } from "@/lib/flow/model";
import type { FlowData } from "@/lib/data/flow";
import { saveFlowAction } from "@/app/(app)/contabilidad/flujo/actions";

type AccountData = { label: string; detail: string; kind: FlowKind };
type AccountNode = Node<AccountData, "account">;
type MoneyData = {
  amount: number | null;
  day: number | null;
  note: string;
  confirmed: boolean;
  /** Punto por el que pasa la flecha si se ha movido a mano. */
  bend?: { x: number; y: number } | null;
  /** Solo para dibujar: todas las transferencias entre estas dos cuentas (una flecha, varias líneas). */
  lines?: { id: string; amount: number | null; day: number | null; note: string; confirmed: boolean }[];
};
type MoneyEdge = Edge<MoneyData, "money">;

const KIND_STYLE: Record<FlowKind, { bar: string; chip: string }> = {
  casa: { bar: "bg-[#8a6a2f]", chip: "bg-[#f6efe2] text-[#6b511f]" },
  ricardo: { bar: "bg-sky-600", chip: "bg-sky-50 text-sky-800" },
  andrea: { bar: "bg-fuchsia-600", chip: "bg-fuchsia-50 text-fuchsia-800" },
  tarjeta: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800" },
  externo: { bar: "bg-slate-500", chip: "bg-slate-100 text-slate-700" },
};

const toInput = (v: number | null) =>
  v === null ? "" : v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false });

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

function edgeLabel(d: MoneyData) {
  const parts = [d.amount !== null ? formatAmount(d.amount) : null, d.day !== null ? `día ${d.day}` : null].filter(Boolean);
  return parts.join(" · ");
}

// --- Conversión documento ⇄ React Flow ------------------------------------

function toFlow(doc: FlowDoc): { nodes: AccountNode[]; edges: MoneyEdge[] } {
  return {
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      type: "account",
      position: { x: n.x, y: n.y },
      data: { label: n.label, detail: n.detail, kind: n.kind },
    })),
    edges: doc.edges.map((e) => ({
      id: e.id,
      type: "money",
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      data: { amount: e.amount, day: e.day, note: e.note, confirmed: e.confirmed, bend: e.bend },
    })),
  };
}

const handleOf = (h: string | null | undefined): FlowHandle | null =>
  h === "t" || h === "r" || h === "b" || h === "l" ? h : null;

function toDoc(nodes: AccountNode[], edges: MoneyEdge[]): FlowDoc {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      label: n.data.label,
      detail: n.data.detail,
      kind: n.data.kind,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: handleOf(e.sourceHandle),
      targetHandle: handleOf(e.targetHandle),
      amount: e.data?.amount ?? null,
      day: e.data?.day ?? null,
      note: e.data?.note ?? "",
      confirmed: e.data?.confirmed ?? true,
      bend: e.data?.bend ? { x: Math.round(e.data.bend.x), y: Math.round(e.data.bend.y) } : null,
    })),
  };
}

// --- Nodo (cuenta) y flecha -------------------------------------------------

const HANDLE_CLASS = "!size-4 !border-2 !border-white !bg-[#8a6a2f] opacity-60 transition-opacity group-hover:opacity-100";

function AccountNodeView({ data, selected }: NodeProps<AccountNode>) {
  const style = KIND_STYLE[data.kind];
  return (
    <div
      className={cn(
        "group relative w-[200px] overflow-hidden rounded-xl border bg-white text-left shadow-sm",
        selected && "ring-2 ring-[#8a6a2f]",
      )}
    >
      <div className={cn("h-1.5", style.bar)} />
      <div className="px-3 py-2">
        <p className="truncate text-sm font-bold text-[#14171f]">{data.label}</p>
        {data.detail && <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-[#5b6170]">{data.detail}</p>}
        <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", style.chip)}>
          {FLOW_KIND_LABEL[data.kind].split(" (")[0]}
        </span>
      </div>
      <Handle id="t" type="source" position={Position.Top} className={HANDLE_CLASS} />
      <Handle id="r" type="source" position={Position.Right} className={HANDLE_CLASS} />
      <Handle id="b" type="source" position={Position.Bottom} className={HANDLE_CLASS} />
      <Handle id="l" type="source" position={Position.Left} className={HANDLE_CLASS} />
    </div>
  );
}

/** Acciones que las flechas piden al editor: abrir una línea y moverlas. */
type EdgeActions = {
  openLine: (id: string) => void;
  /** Mueve la flecha (y las de su grupo) para que pase por `p`; null = ruta automática. */
  setBend: (id: string, p: { x: number; y: number } | null, final: boolean) => void;
  toFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
};
const EdgeActionsContext = createContext<EdgeActions>({ openLine: () => {}, setBend: () => {}, toFlowPosition: (p) => p });

/** Orden de las líneas: por día (las sin día al final). */
const byDay = (a: { day: number | null }, b: { day: number | null }) => (a.day ?? 99) - (b.day ?? 99);

type Pt = { x: number; y: number };
const isVertical = (p: Position) => p === Position.Top || p === Position.Bottom;

/**
 * Ruta ortogonal que pasa por el punto `bend` (flecha movida a mano):
 * sale y entra perpendicular a cada cuenta, con esquinas redondeadas.
 * Devuelve el trazado y dónde va la etiqueta.
 */
function bentPath(s: Pt, sp: Position, t: Pt, tp: Position, bend: Pt): [string, number, number] {
  const sv = isVertical(sp);
  const tv = isVertical(tp);
  let pts: Pt[];
  let label: Pt;
  if (sv && tv) {
    pts = [s, { x: s.x, y: bend.y }, { x: t.x, y: bend.y }, t];
    label = { x: Math.min(Math.max(bend.x, Math.min(s.x, t.x)), Math.max(s.x, t.x)), y: bend.y };
  } else if (!sv && !tv) {
    pts = [s, { x: bend.x, y: s.y }, { x: bend.x, y: t.y }, t];
    label = { x: bend.x, y: Math.min(Math.max(bend.y, Math.min(s.y, t.y)), Math.max(s.y, t.y)) };
  } else if (sv) {
    pts = [s, { x: s.x, y: bend.y }, bend, { x: bend.x, y: t.y }, t];
    label = bend;
  } else {
    pts = [s, { x: bend.x, y: s.y }, bend, { x: t.x, y: bend.y }, t];
    label = bend;
  }
  // Quitar puntos repetidos o en línea recta.
  const clean = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
  const simple = clean.filter((p, i) => {
    if (i === 0 || i === clean.length - 1) return true;
    const a = clean[i - 1];
    const b = clean[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
  let d = `M${simple[0].x} ${simple[0].y}`;
  for (let i = 1; i < simple.length - 1; i++) {
    const a = simple[i - 1];
    const p = simple[i];
    const b = simple[i + 1];
    const r = Math.min(12, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(b.x - p.x, b.y - p.y) / 2);
    const inX = Math.sign(p.x - a.x);
    const inY = Math.sign(p.y - a.y);
    const outX = Math.sign(b.x - p.x);
    const outY = Math.sign(b.y - p.y);
    d += `L${p.x - inX * r} ${p.y - inY * r}Q${p.x} ${p.y} ${p.x + outX * r} ${p.y + outY * r}`;
  }
  const last = simple[simple.length - 1];
  d += `L${last.x} ${last.y}`;
  return [d, label.x, label.y];
}

/** Asa para mover una flecha: arrastrar = moverla; doble clic = volver a su sitio. */
function BendGrip({ edgeId, className }: { edgeId: string; className?: string }) {
  const { setBend, toFlowPosition } = useContext(EdgeActionsContext);
  const drag = useRef<{ last: Pt | null } | null>(null);
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label="Mover la flecha (doble clic: volver a su sitio)"
      title="Arrastra para mover la flecha · doble clic para volver a su sitio"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { last: null };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const p = toFlowPosition({ x: e.clientX, y: e.clientY });
        const pt = { x: Math.round(p.x), y: Math.round(p.y) };
        drag.current.last = pt;
        setBend(edgeId, pt, false);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const last = drag.current?.last ?? null;
        drag.current = null;
        if (last) setBend(edgeId, last, true);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setBend(edgeId, null, true);
      }}
      className={cn(
        "flex cursor-move touch-none items-center justify-center text-[#8b8f99] hover:text-[#8a6a2f]",
        className,
      )}
    >
      <GripHorizontal className="size-3.5" aria-hidden />
    </span>
  );
}

function MoneyEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<MoneyEdge>) {
  const { openLine } = useContext(EdgeActionsContext);
  const bend = data?.bend ?? null;
  const [path, labelX, labelY] = bend
    ? bentPath({ x: sourceX, y: sourceY }, sourcePosition, { x: targetX, y: targetY }, targetPosition, bend)
    : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12 });
  const lines = data?.lines ?? (data ? [{ id, ...data }] : []);
  const confirmed = lines.some((l) => l.confirmed);
  const shown = lines.filter((l) => edgeLabel(l) || l.note);
  const total = lines.every((l) => l.amount !== null) ? lines.reduce((t, l) => t + (l.amount ?? 0), 0) : null;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#8a6a2f" : confirmed ? "#14171f" : "#8b8f99",
          strokeWidth: selected ? 2.5 : lines.length > 1 ? 2.25 : 1.75,
          strokeDasharray: confirmed ? undefined : "6 5",
        }}
      />
      {shown.length === 0 && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded-full border bg-white p-1 shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <BendGrip edgeId={id} />
          </div>
        </EdgeLabelRenderer>
      )}
      {shown.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-auto absolute max-w-[200px] rounded-lg border bg-white/95 py-0.5 shadow-sm",
              selected && "border-[#8a6a2f]",
              !confirmed && "border-dashed",
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <BendGrip edgeId={id} className="h-3.5 w-full" />
            {[...shown].sort(byDay).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openLine(l.id);
                }}
                className="block w-full px-2 py-0.5 text-center hover:bg-[#f6efe2]"
              >
                {edgeLabel(l) && <span className="block text-[11px] font-bold text-[#14171f] tabular-nums">{edgeLabel(l)}</span>}
                {l.note && <span className="block text-[10px] leading-tight text-[#5b6170]">{l.note}</span>}
                {!l.confirmed && <span className="block text-[9px] font-bold tracking-wide text-[#b4500b] uppercase">por confirmar</span>}
              </button>
            ))}
            {lines.length > 1 && total !== null && (
              <span className="block border-t px-2 pt-0.5 text-center text-[10px] font-bold text-[#14171f] tabular-nums">
                Total {formatAmount(total)}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** Puntos de conexión según la posición relativa de las dos cuentas. */
function autoHandles(from: AccountNode | undefined, to: AccountNode | undefined): { sourceHandle: FlowHandle; targetHandle: FlowHandle } {
  if (!from || !to) return { sourceHandle: "b", targetHandle: "t" };
  const dx = to.position.x - from.position.x;
  const dy = to.position.y - from.position.y;
  if (Math.abs(dy) >= 60) return dy > 0 ? { sourceHandle: "b", targetHandle: "t" } : { sourceHandle: "t", targetHandle: "b" };
  return dx > 0 ? { sourceHandle: "r", targetHandle: "l" } : { sourceHandle: "l", targetHandle: "r" };
}

const nodeTypes = { account: AccountNodeView };
const edgeTypes = { money: MoneyEdgeView };
const defaultEdgeOptions = { type: "money" as const, markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 } };

// --- Editor -------------------------------------------------------------------

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export function FlowEditor({ initial }: { initial: FlowData }) {
  return (
    <ReactFlowProvider>
      <Editor initial={initial} />
    </ReactFlowProvider>
  );
}

function Editor({ initial }: { initial: FlowData }) {
  const start = useMemo(() => toFlow(initial.doc), [initial.doc]);
  const [nodes, setNodes, onNodesChange] = useNodesState<AccountNode>(start.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<MoneyEdge>(
    start.edges.map((e) => ({ ...e, markerEnd: defaultEdgeOptions.markerEnd })),
  );
  const [dialog, setDialog] = useState<
    { kind: "node"; id: string } | { kind: "edge"; id: string } | { kind: "new-edge" } | null
  >(null);
  const [state, setState] = useState<SaveState>("saved");
  const [changes, setChanges] = useState(0);
  const base = useRef<string | null>(initial.updatedAt);
  const [, startSave] = useTransition();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const touch = useCallback(() => {
    setChanges((c) => c + 1);
    setState((s) => (s === "conflict" ? s : "dirty"));
  }, []);

  // Guardado automático 1,2 s después del último cambio.
  useEffect(() => {
    if (changes === 0 || state === "conflict") return;
    const t = setTimeout(() => {
      setState("saving");
      startSave(async () => {
        const res = await saveFlowAction(toDoc(nodes, edges), base.current);
        if (res.ok) {
          base.current = res.updatedAt;
          setState("saved");
        } else if (res.conflict) {
          setState("conflict");
        } else {
          setState("error");
          toast.error(res.error ?? "No se pudo guardar.");
        }
      });
    }, 1200);
    return () => clearTimeout(t);
    // Solo al cambiar el contador: nodes/edges se leen en el momento de guardar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes]);

  // Avisar si se cierra la página con cambios sin guardar.
  useEffect(() => {
    if (state !== "dirty" && state !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const handleNodesChange = useCallback(
    (cs: NodeChange<AccountNode>[]) => {
      onNodesChange(cs);
      if (cs.some((c) => (c.type === "position" && c.dragging === false) || c.type === "remove" || c.type === "add")) touch();
    },
    [onNodesChange, touch],
  );
  const handleEdgesChange = useCallback(
    (cs: EdgeChange<MoneyEdge>[]) => {
      onEdgesChange(cs);
      if (cs.some((c) => c.type === "remove" || c.type === "add")) touch();
    },
    [onEdgesChange, touch],
  );
  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source === c.target) return;
      const id = newId("e");
      setEdges((es) =>
        addEdge(
          { ...c, id, ...defaultEdgeOptions, data: { amount: null, day: null, note: "", confirmed: true } } as MoneyEdge,
          es,
        ),
      );
      touch();
      setDialog({ kind: "edge", id });
    },
    [setEdges, touch],
  );

  const addAccount = () => {
    const rect = wrapper.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    const id = newId("n");
    // En el centro de la vista o, si ahí ya hay una cuenta, en el hueco libre más cercano.
    const free = (x: number, y: number) => nodes.every((n) => Math.abs(n.position.x - x) > 220 || Math.abs(n.position.y - y) > 110);
    let position = { x: center.x - 100, y: center.y - 40 };
    search: for (let r = 1; r <= 12 && !free(position.x, position.y); r++) {
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const cand = { x: center.x - 100 + dx * 120 * r, y: center.y - 40 + dy * 60 * r };
        if (free(cand.x, cand.y)) {
          position = cand;
          break search;
        }
      }
    }
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { id, type: "account", position, data: { label: "Nueva cuenta", detail: "", kind: "casa" } },
    ]);
    touch();
    setDialog({ kind: "node", id });
  };

  // Una flecha por pareja de cuentas (en el mismo sentido); su etiqueta lleva todas las líneas.
  const displayEdges = useMemo(() => {
    const groups = new Map<string, MoneyEdge[]>();
    for (const e of edges) groups.set(`${e.source}>${e.target}`, [...(groups.get(`${e.source}>${e.target}`) ?? []), e]);
    return edges.map((e) => {
      const group = groups.get(`${e.source}>${e.target}`)!;
      if (group[0].id !== e.id) return { ...e, hidden: true };
      if (group.length === 1) return e;
      return {
        ...e,
        data: {
          ...(e.data as MoneyData),
          lines: group.map((g) => ({
            id: g.id,
            amount: g.data?.amount ?? null,
            day: g.data?.day ?? null,
            note: g.data?.note ?? "",
            confirmed: g.data?.confirmed ?? true,
          })),
        },
      };
    });
  }, [edges]);

  const setBend = useCallback<EdgeActions["setBend"]>(
    (id, p, final) => {
      setEdges((es) => {
        const first = es.find((e) => e.id === id);
        if (!first) return es;
        return es.map((e) =>
          e.source === first.source && e.target === first.target ? { ...e, data: { ...(e.data as MoneyData), bend: p } } : e,
        );
      });
      if (final) touch();
    },
    [setEdges, touch],
  );
  const edgeActions = useMemo<EdgeActions>(
    () => ({ openLine: (id) => setDialog({ kind: "edge", id }), setBend, toFlowPosition: screenToFlowPosition }),
    [setBend, screenToFlowPosition],
  );

  // Arrastrar un extremo de una flecha a otro punto (o a otra cuenta): se mueven todas sus líneas.
  const onReconnect = useCallback(
    (old: MoneyEdge, c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      setEdges((es) =>
        es.map((e) =>
          e.source === old.source && e.target === old.target
            ? {
                ...e,
                source: c.source,
                target: c.target,
                sourceHandle: c.sourceHandle ?? null,
                targetHandle: c.targetHandle ?? null,
                data: { ...(e.data as MoneyData), bend: null },
              }
            : e,
        ),
      );
      touch();
    },
    [setEdges, touch],
  );

  const saveLine = (id: string | null, line: { data: MoneyData; source: string; target: string }) => {
    const from = nodes.find((n) => n.id === line.source);
    const to = nodes.find((n) => n.id === line.target);
    setEdges((es) => {
      const current = id ? es.find((e) => e.id === id) : undefined;
      const sameEnds = current && current.source === line.source && current.target === line.target;
      // Si va entre las mismas cuentas que otra flecha, usa sus puntos (se dibujan juntas).
      const sibling = es.find((e) => e.id !== id && e.source === line.source && e.target === line.target);
      const handles = sameEnds
        ? { sourceHandle: current.sourceHandle, targetHandle: current.targetHandle }
        : sibling
          ? { sourceHandle: sibling.sourceHandle, targetHandle: sibling.targetHandle }
          : autoHandles(from, to);
      const edge: MoneyEdge = {
        ...(current ?? { id: newId("e"), ...defaultEdgeOptions }),
        source: line.source,
        target: line.target,
        ...handles,
        data: { ...line.data, bend: sameEnds ? (current.data?.bend ?? null) : (sibling?.data?.bend ?? null) },
      };
      return current ? es.map((e) => (e.id === id ? edge : e)) : [...es, edge];
    });
    touch();
    setDialog(null);
  };

  const editingNode = dialog?.kind === "node" ? nodes.find((n) => n.id === dialog.id) : undefined;
  const editingEdge = dialog?.kind === "edge" ? edges.find((e) => e.id === dialog.id) : undefined;
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? "?";

  return (
    <div className="space-y-4 lg:space-y-5">
      {state === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-warning/40 bg-[#fff4ea] p-4 text-sm">
          <p className="min-w-0 flex-1">
            <strong>Alguien ha cambiado el diagrama mientras lo editabas.</strong> Tus últimos cambios no se han guardado
            para no pisar los suyos.
          </p>
          <Button onClick={() => window.location.reload()} className="h-11 rounded-xl px-4">
            <RotateCcw aria-hidden /> Cargar la versión actual
          </Button>
        </div>
      )}

      <EdgeActionsContext.Provider value={edgeActions}>
      <div
        ref={wrapper}
        className="h-[62dvh] min-h-[420px] overflow-hidden rounded-card border bg-card lg:h-[68dvh]"
        aria-label="Diagrama del flujo de dinero"
      >
        <ReactFlow<AccountNode, MoneyEdge>
          nodes={nodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          reconnectRadius={14}
          onNodeClick={(_, n) => setDialog({ kind: "node", id: n.id })}
          onEdgeClick={(_, e) => setDialog({ kind: "edge", id: e.id })}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={36}
          deleteKeyCode={null}
          colorMode="light"
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="#e7e2d8" />
          <Controls showInteractive={false} position="bottom-right" />
          <Panel position="top-left" className="!m-2 flex flex-wrap items-center gap-2">
            <Button onClick={addAccount} className="h-10 rounded-xl px-3 shadow-sm">
              <Plus aria-hidden /> Cuenta
            </Button>
            <Button variant="outline" onClick={() => fitView({ padding: 0.15, duration: 300 })} className="h-10 rounded-xl bg-white px-3 shadow-sm">
              <Maximize aria-hidden /> Ver todo
            </Button>
          </Panel>
          <Panel position="top-right" className="!m-2">
            <SaveBadge state={state} />
          </Panel>
        </ReactFlow>
      </div>
      </EdgeActionsContext.Provider>
      <p className="text-xs text-muted-foreground">
        Arrastra las cuentas para colocarlas. Para una flecha nueva, arrastra desde uno de los puntos de una cuenta hasta
        otra, o añádela en la lista de transferencias. Para que no se pisen, arrastra el asa ⠿ de una flecha (doble clic
        la devuelve a su sitio) o lleva uno de sus extremos a otro punto de la cuenta. Toca una cuenta o una transferencia para cambiarla o borrarla. Se
        guarda solo y lo ven los dos.
      </p>

      <TransferList
        edges={edges}
        nameOf={nameOf}
        canAdd={nodes.length >= 2}
        onAdd={() => setDialog({ kind: "new-edge" })}
        onOpen={(id) => setDialog({ kind: "edge", id })}
      />

      {editingNode && (
        <NodeDialog
          key={editingNode.id}
          node={editingNode}
          links={edges.filter((e) => e.source === editingNode.id || e.target === editingNode.id).length}
          onClose={() => setDialog(null)}
          onSave={(data) => {
            setNodes((ns) => ns.map((n) => (n.id === editingNode.id ? { ...n, data } : n)));
            touch();
            setDialog(null);
          }}
          onDelete={() => {
            setNodes((ns) => ns.filter((n) => n.id !== editingNode.id));
            setEdges((es) => es.filter((e) => e.source !== editingNode.id && e.target !== editingNode.id));
            touch();
            setDialog(null);
          }}
        />
      )}
      {(editingEdge || dialog?.kind === "new-edge") && (
        <EdgeDialog
          key={editingEdge?.id ?? "new"}
          edge={editingEdge ?? null}
          accounts={nodes.map((n) => ({ id: n.id, label: n.data.label }))}
          onClose={() => setDialog(null)}
          onSave={(line) => saveLine(editingEdge?.id ?? null, line)}
          onDelete={
            editingEdge
              ? () => {
                  setEdges((es) => es.filter((e) => e.id !== editingEdge.id));
                  touch();
                  setDialog(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; icon?: React.ReactNode; className: string }> = {
    saved: { text: "Guardado", icon: <Check className="size-3.5" aria-hidden />, className: "text-positive" },
    dirty: { text: "Cambios sin guardar", className: "text-muted-foreground" },
    saving: { text: "Guardando…", icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />, className: "text-muted-foreground" },
    error: { text: "No se pudo guardar", className: "text-warning" },
    conflict: { text: "Sin guardar", className: "text-warning" },
  };
  const s = map[state];
  return (
    <span role="status" className={cn("flex items-center gap-1 rounded-full border bg-white px-3 py-1.5 text-xs font-bold shadow-sm", s.className)}>
      {s.icon}
      {s.text}
    </span>
  );
}

/**
 * Transferencias a realizar: una línea por transferencia (cada una es una
 * flecha del diagrama), ordenadas por día del mes, con lo que sale de cada cuenta.
 */
function TransferList({
  edges,
  nameOf,
  canAdd,
  onAdd,
  onOpen,
}: {
  edges: MoneyEdge[];
  nameOf: (id: string) => string;
  canAdd: boolean;
  onAdd: () => void;
  onOpen: (id: string) => void;
}) {
  const sorted = [...edges].sort((a, b) => byDay({ day: a.data?.day ?? null }, { day: b.data?.day ?? null }));
  const fixed = edges.filter((e) => e.data?.amount !== null && e.data?.amount !== undefined);
  const total = fixed.reduce((t, e) => t + (e.data?.amount ?? 0), 0);
  const variable = edges.length - fixed.length;
  // Lo que sale de cada cuenta al mes (solo importes fijos).
  const out = new Map<string, number>();
  for (const e of fixed) out.set(e.source, (out.get(e.source) ?? 0) + (e.data?.amount ?? 0));

  return (
    <section aria-labelledby="flow-transfers" className="rounded-card border bg-card p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="flow-transfers" className="text-base font-bold">
          Transferencias del mes
        </h2>
        <Button onClick={onAdd} disabled={!canAdd} className="h-10 rounded-xl px-3">
          <Plus aria-hidden /> Transferencia
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Aún no hay transferencias. Añade la primera.</p>
      ) : (
        <>
          <ul className="mt-2 divide-y">
            {sorted.map((e) => {
              const d = e.data;
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => onOpen(e.id)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-accent">
                    <span className="w-12 shrink-0 text-center">
                      {d?.day ? (
                        <>
                          <span className="block text-[10px] font-bold text-muted-foreground uppercase">día</span>
                          <span className="block text-lg leading-none font-extrabold tabular-nums">{d.day}</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">sin día</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {nameOf(e.source)} → {nameOf(e.target)}
                      </span>
                      {(d?.note || d?.confirmed === false) && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {d?.note}
                          {d?.confirmed === false && <span className="ml-1 font-bold text-warning">· por confirmar</span>}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">
                      {d?.amount !== null && d?.amount !== undefined ? (
                        formatAmount(d.amount)
                      ) : (
                        <span className="font-normal text-muted-foreground">variable</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 border-t pt-3">
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-bold">Total al mes</span>
              <span className="font-extrabold tabular-nums">{formatAmount(total)}</span>
            </p>
            {variable > 0 && (
              <p className="text-xs text-muted-foreground">
                Más {variable} {variable === 1 ? "transferencia de importe variable" : "transferencias de importe variable"}.
              </p>
            )}
            {out.size > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-muted-foreground">Sale de cada cuenta al mes</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {[...out.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, amount]) => (
                      <li key={id} className="rounded-full border bg-surface px-3 py-1 text-xs">
                        {nameOf(id)}: <strong className="tabular-nums">{formatAmount(amount)}</strong>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// --- Ventanas de edición ------------------------------------------------------

function NodeDialog({
  node,
  links,
  onClose,
  onSave,
  onDelete,
}: {
  node: AccountNode;
  links: number;
  onClose: () => void;
  onSave: (d: AccountData) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(node.data.label);
  const [detail, setDetail] = useState(node.data.detail);
  const [kind, setKind] = useState<FlowKind>(node.data.kind);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const valid = label.trim().length > 0 && label.trim().length <= 60 && detail.trim().length <= 80;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cuenta</DialogTitle>
          <DialogDescription>Nombre, detalle (banco, titular, para qué sirve) y de quién es.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSave({ label: label.trim(), detail: detail.trim(), kind });
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="node-label" className="text-xs font-bold text-muted-foreground">
              Nombre
            </label>
            <Input id="node-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} className="h-11" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="node-detail" className="text-xs font-bold text-muted-foreground">
              Detalle
            </label>
            <Input id="node-detail" value={detail} maxLength={80} onChange={(e) => setDetail(e.target.value)} className="h-11" />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-bold text-muted-foreground">De quién es</legend>
            <div className="flex flex-wrap gap-2">
              {FLOW_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "h-10 rounded-xl border px-3 text-sm font-semibold",
                    kind === k ? "border-foreground bg-foreground text-background" : "bg-surface hover:bg-accent",
                  )}
                >
                  {FLOW_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </fieldset>
          <DialogFooter className="gap-2">
            {confirmDelete ? (
              <Button type="button" variant="destructive" onClick={onDelete} className="h-11 sm:mr-auto">
                Sí, borrar{links ? ` (y ${links} ${links === 1 ? "flecha" : "flechas"})` : ""}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)} className="h-11 sm:mr-auto">
                <Trash2 aria-hidden /> Borrar cuenta
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="h-11">
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid} className="h-11">
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EdgeDialog({
  edge,
  accounts,
  onClose,
  onSave,
  onDelete,
}: {
  edge: MoneyEdge | null;
  accounts: { id: string; label: string }[];
  onClose: () => void;
  onSave: (line: { data: MoneyData; source: string; target: string }) => void;
  onDelete?: () => void;
}) {
  const d = edge?.data ?? { amount: null, day: null, note: "", confirmed: true };
  const [source, setSource] = useState(edge?.source ?? accounts[0]?.id ?? "");
  const [target, setTarget] = useState(edge?.target ?? accounts[1]?.id ?? "");
  const [amount, setAmount] = useState(toInput(d.amount));
  const [day, setDay] = useState(d.day ? String(d.day) : "");
  const [note, setNote] = useState(d.note);
  const [confirmed, setConfirmed] = useState(d.confirmed);

  const parsedAmount = parseAmount(amount);
  const amountOk = amount.trim() === "" || (parsedAmount !== null && !Number.isNaN(parsedAmount) && parsedAmount >= 0);
  const dayNum = day.trim() === "" ? null : Number(day);
  const dayOk = dayNum === null || (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31);
  const endsOk = source !== "" && target !== "" && source !== target;
  const valid = endsOk && amountOk && dayOk && note.trim().length <= 120;
  const selectClass =
    "h-11 w-full min-w-0 rounded-xl border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edge ? "Transferencia" : "Nueva transferencia"}</DialogTitle>
          <DialogDescription>De qué cuenta a cuál, cuánto y qué día del mes. Se dibuja como una flecha.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSave({
              source,
              target,
              data: {
                amount: amount.trim() === "" ? null : Math.round((parsedAmount as number) * 100) / 100,
                day: dayNum,
                note: note.trim(),
                confirmed,
              },
            });
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="edge-from" className="text-xs font-bold text-muted-foreground">
                Desde
              </label>
              <select id="edge-from" value={source} onChange={(e) => setSource(e.target.value)} className={selectClass}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              aria-label="Cambiar el sentido"
              onClick={() => {
                setSource(target);
                setTarget(source);
              }}
              className="size-11"
            >
              <ArrowRightLeft aria-hidden />
            </Button>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="edge-to" className="text-xs font-bold text-muted-foreground">
                Hacia
              </label>
              <select id="edge-to" value={target} onChange={(e) => setTarget(e.target.value)} className={selectClass}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!endsOk && <p className="text-xs font-bold text-warning">Elige dos cuentas distintas.</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edge-amount" className="text-xs font-bold text-muted-foreground">
                Importe (vacío = variable)
              </label>
              <Input
                id="edge-amount"
                inputMode="decimal"
                placeholder="variable"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!amountOk}
                className="h-11 tabular-nums"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edge-day" className="text-xs font-bold text-muted-foreground">
                Día del mes
              </label>
              <Input
                id="edge-day"
                inputMode="numeric"
                placeholder="sin día"
                value={day}
                onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-invalid={!dayOk}
                className="h-11 tabular-nums"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edge-note" className="text-xs font-bold text-muted-foreground">
              Para qué
            </label>
            <Input
              id="edge-note"
              value={note}
              maxLength={120}
              placeholder="Ej.: Traspaso de la Amex, nómina, cuota del préstamo…"
              onChange={(e) => setNote(e.target.value)}
              className="h-11"
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={!confirmed} onChange={(e) => setConfirmed(!e.target.checked)} className="size-5 accent-[#8a6a2f]" />
            Por confirmar (se ve con línea discontinua)
          </label>
          <DialogFooter className="gap-2">
            {onDelete && (
              <Button type="button" variant="outline" onClick={onDelete} className="h-11 sm:mr-auto">
                <Trash2 aria-hidden /> Borrar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="h-11">
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid} className="h-11">
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
