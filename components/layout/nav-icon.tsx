import {
  BookOpenText,
  CreditCard,
  LayoutDashboard,
  ShoppingBasket,
  type LucideProps,
} from "lucide-react";
import type { NavIconName } from "@/lib/nav";

const ICONS = {
  resumen: LayoutDashboard,
  contabilidad: BookOpenText,
  supermercado: ShoppingBasket,
  pagos: CreditCard,
} satisfies Record<NavIconName, unknown>;

export function NavIcon({ name, ...props }: { name: NavIconName } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon aria-hidden {...props} />;
}
