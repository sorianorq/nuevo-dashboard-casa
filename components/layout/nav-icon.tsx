import {
  ArrowLeftRight,
  BookOpenText,
  LayoutDashboard,
  ShoppingBasket,
  type LucideProps,
} from "lucide-react";
import type { NavIconName } from "@/lib/nav";

const ICONS = {
  resumen: LayoutDashboard,
  contabilidad: BookOpenText,
  supermercado: ShoppingBasket,
  movimientos: ArrowLeftRight,
} satisfies Record<NavIconName, unknown>;

export function NavIcon({ name, ...props }: { name: NavIconName } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon aria-hidden {...props} />;
}
