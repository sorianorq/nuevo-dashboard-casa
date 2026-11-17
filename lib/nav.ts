/** Navegación (especificación, apartado 3). */

export type NavIconName =
  | "resumen"
  | "contabilidad"
  | "supermercado"
  | "pagos";

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
      { label: "Movimientos", href: "/contabilidad/movimientos" },
      { label: "Presupuesto", href: "/contabilidad/presupuesto" },
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
    id: "pagos",
    label: "Pagos",
    shortLabel: "Pagos",
    icon: "pagos",
    href: "/pagos/amex",
    match: "/pagos",
    children: [
      { label: "American Express", href: "/pagos/amex" },
      { label: "Pagos", href: "/pagos/personales" },
    ],
  },
];

export function isActive(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function sectionFor(pathname: string) {
  return NAV.find((s) => isActive(pathname, s.match));
}
