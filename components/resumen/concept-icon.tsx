import {
  Bus,
  Car,
  CreditCard,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  PartyPopper,
  Plane,
  Repeat,
  Shield,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Icono de un concepto de gasto según su nombre o su grupo (si no encaja, una etiqueta). */
const RULES: [RegExp, LucideIcon][] = [
  [/super|compra|mercadona|costco|aliment/i, ShoppingCart],
  [/luz|electric|agua|gas\b|sunflower|suministro/i, Zap],
  [/tel[eé]fono|m[oó]vil|internet|fibra/i, Smartphone],
  [/seguro/i, Shield],
  [/pr[eé]stamo|hipoteca|financ|comisi|banco|transferencia/i, Landmark],
  [/coche|gasolina|parking|taller|itv/i, Car],
  [/transporte|metro|bus|taxi|uber|cabify|tren/i, Bus],
  [/viaje|vuelo|hotel|vacacion/i, Plane],
  [/ocio|cine|concierto|fiesta|regalo/i, PartyPopper],
  [/restaurante|comida|cena|bar\b|caf[eé]/i, Utensils],
  [/salud|m[eé]dic|farmacia|dentista|belleza|peluquer/i, HeartPulse],
  [/gimnasio|deporte|club/i, Dumbbell],
  [/suscrip|apple|netflix|spotify|claude|amazon|google/i, Repeat],
  [/colegio|curso|formaci|universidad|master/i, GraduationCap],
  [/casa|hogar|comunidad|ibi|alquiler|limpieza|verisure/i, House],
  [/amex|tarjeta/i, CreditCard],
  [/otros/i, Sparkles],
];

export function conceptIcon(name: string, parentName: string | null): LucideIcon {
  for (const [re, icon] of RULES) if (re.test(name)) return icon;
  if (parentName) for (const [re, icon] of RULES) if (re.test(parentName)) return icon;
  return Tag;
}
