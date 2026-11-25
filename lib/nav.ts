/** Navegación (especificación, apartado 3). */

export type NavIconName =
  | "resumen"
  | "contabilidad"
  | "supermercado"
  | "movimientos";

export type NavChild = { label: string; href: string };

export type NavSection = {
  id: string;
  label: string;
  /** Etiqueta corta para la barra inferior del móvil. */
  shortLabel: string;
  icon: NavIconName;
  /** Destino al pulsar la sección (sin hijos, o primer hijo). */
  href: string;
  /** Prefijo de ruta para marcarla activa. */
  match: string;
  children?: NavChild[];
};

export const NAV: NavSection[] = [
  {
    id: "resumen",
    label: "Resumen",
    shortLabel: "Resumen",
    icon: "resumen",
    href: "/resumen",
    match: "/resumen",
  },
  {
    id: "contabilidad",
    label: "Contabilidad",
    shortLabel: "Contabilidad",
    icon: "contabilidad",
    href: "/contabilidad/balances",
    match: "/contabilidad",
    children: [
      { label: "Balances", href: "/contabilidad/balances" },
      { label: "Presupuesto", href: "/contabilidad/presupuesto" },
      { label: "Flujo de dinero", href: "/contabilidad/flujo" },
    ],
  },
  {
    id: "supermercado",
    label: "Supermercado",
    shortLabel: "Súper",
    icon: "supermercado",
    href: "/supermercado",
    match: "/supermercado",
  },
  {
    id: "movimientos",
    label: "Movimientos",
    shortLabel: "Movimientos",
    icon: "movimientos",
    href: "/movimientos",
    match: "/movimientos",
  },
];

export function isActive(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function sectionFor(pathname: string) {
  return NAV.find((s) => isActive(pathname, s.match));
}
