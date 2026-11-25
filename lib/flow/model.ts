import { z } from "zod";

/**
 * Flujo de dinero: diagrama compartido (tabla money_flow, script 14).
 * Cuentas (nodos) y flechas (traspasos, cargos, nóminas…) con importe,
 * día del mes y nota. Lo dibujan Andrea y Ricardo; nada se calcula de él.
 */

export const FLOW_KINDS = ["casa", "ricardo", "andrea", "tarjeta", "externo"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

export const FLOW_KIND_LABEL: Record<FlowKind, string> = {
  casa: "Casa",
  ricardo: "Ricardo",
  andrea: "Andrea",
  tarjeta: "Tarjeta",
  externo: "Externo (nómina, préstamo…)",
};

const text = (max: number) => z.string().trim().max(max);

export const FlowNode = z.object({
  id: z.string().min(1).max(40),
  x: z.number().finite(),
  y: z.number().finite(),
  label: text(60).min(1),
  detail: text(80),
  kind: z.enum(FLOW_KINDS),
});
export type FlowNode = z.infer<typeof FlowNode>;

const HANDLES = ["t", "r", "b", "l"] as const;
export type FlowHandle = (typeof HANDLES)[number];

export const FlowEdge = z.object({
  id: z.string().min(1).max(40),
  source: z.string().min(1).max(40),
  target: z.string().min(1).max(40),
  sourceHandle: z.enum(HANDLES).nullable(),
  targetHandle: z.enum(HANDLES).nullable(),
  /** Importe en euros (null = variable / sin fijar). */
  amount: z.number().finite().min(0).max(1e7).nullable(),
  /** Día del mes en que se hace (null = sin día fijo). */
  day: z.number().int().min(1).max(31).nullable(),
  note: text(120),
  /** false = flecha discontinua «por confirmar». */
  confirmed: z.boolean(),
});
export type FlowEdge = z.infer<typeof FlowEdge>;

export const FlowDoc = z
  .object({
    nodes: z.array(FlowNode).max(100),
    edges: z.array(FlowEdge).max(200),
  })
  .refine((d) => {
    const ids = new Set(d.nodes.map((n) => n.id));
    return ids.size === d.nodes.length && d.edges.every((e) => ids.has(e.source) && ids.has(e.target));
  }, "Hay flechas que apuntan a cuentas que no existen.");
export type FlowDoc = z.infer<typeof FlowDoc>;

/**
 * Diagrama de partida (mientras nadie ha guardado uno), con lo que se ve en
 * los extractos y lo que contó Ricardo sobre la Amex. Lo dudoso va «por confirmar».
 */
export const STARTER_FLOW: FlowDoc = {
  nodes: [
    { id: "bankinter", x: 0, y: 0, label: "Bankinter", detail: "Cuenta de Ricardo", kind: "ricardo" },
    { id: "andrea", x: 640, y: 0, label: "Cuenta de Andrea", detail: "Cuenta personal", kind: "andrea" },
    { id: "sab-gasto", x: 320, y: 200, label: "Sabadell Gasto", detail: "Cuenta común de Casa", kind: "casa" },
    { id: "sab-ahorro", x: 780, y: 200, label: "Sabadell Ahorro", detail: "Ahorro de Casa", kind: "casa" },
    { id: "amex", x: 320, y: 400, label: "American Express", detail: "Tarjeta de Casa · periodo 27 → 26", kind: "tarjeta" },
    { id: "op-gasto", x: -320, y: 200, label: "Openbank Gasto", detail: "Ricardo", kind: "ricardo" },
    { id: "op-ahorro", x: -560, y: 400, label: "Openbank Ahorro", detail: "Ricardo", kind: "ricardo" },
    { id: "santander", x: -120, y: 400, label: "Santander", detail: "Préstamo · cuota 497,73 € el día 1", kind: "externo" },
  ],
  edges: [
    {
      id: "e-ric-casa",
      source: "bankinter",
      target: "sab-gasto",
      sourceHandle: "b",
      targetHandle: "l",
      amount: null,
      day: null,
      note: "Traspaso de lo que Ricardo paga con la Amex",
      confirmed: true,
    },
    {
      id: "e-and-casa",
      source: "andrea",
      target: "sab-gasto",
      sourceHandle: "b",
      targetHandle: "t",
      amount: null,
      day: null,
      note: "Traspaso de lo que Andrea paga con la Amex",
      confirmed: true,
    },
    {
      id: "e-casa-amex",
      source: "sab-gasto",
      target: "amex",
      sourceHandle: "b",
      targetHandle: "t",
      amount: null,
      day: 2,
      note: "Cargo de la Amex (lo gastado del 27 al 26)",
      confirmed: true,
    },
    {
      id: "e-casa-ahorro",
      source: "sab-gasto",
      target: "sab-ahorro",
      sourceHandle: "r",
      targetHandle: "l",
      amount: null,
      day: null,
      note: "¿Ahorro de Casa?",
      confirmed: false,
    },
    {
      id: "e-op-prestamo",
      source: "op-gasto",
      target: "santander",
      sourceHandle: "b",
      targetHandle: "t",
      amount: 498,
      day: 25,
      note: "Pago préstamo (visto hasta marzo 2026)",
      confirmed: false,
    },
    {
      id: "e-op-ahorro",
      source: "op-gasto",
      target: "op-ahorro",
      sourceHandle: "b",
      targetHandle: "t",
      amount: 300,
      day: 25,
      note: "Apartijo varios (visto hasta marzo 2026)",
      confirmed: false,
    },
  ],
};
