import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { SUPER_CATEGORIES } from "@/lib/labels";

/**
 * Lee la foto de un ticket de supermercado con Claude (visión + salida
 * estructurada): tienda, fecha, total, forma de pago y cada línea con su
 * importe y la categoría de Supermercado que le corresponde.
 */

const CATEGORY_IDS = SUPER_CATEGORIES.map((c) => c.id) as [string, ...string[]];

export const TicketRead = z.object({
  /** false si la foto no es un ticket de compra o no se puede leer. */
  is_receipt: z.boolean(),
  /** Si no se puede leer: explicación breve en español (p. ej. «La foto está borrosa»). */
  problem: z.string().nullable(),
  /** Nombre comercial corto de la tienda: «Mercadona», «Lidl», «Carrefour». */
  store: z.string().nullable(),
  /** Fecha de la compra AAAA-MM-DD. */
  date: z.string().nullable(),
  /** TOTAL a pagar del ticket, en euros. */
  total: z.number().nullable(),
  /** Forma de pago que se ve en el ticket. */
  payment: z.enum(["tarjeta", "efectivo", "amex"]).nullable(),
  lines: z.array(
    z.object({
      /** Texto del producto tal como sale en el ticket (sin el importe). */
      text: z.string(),
      /** Importe final de la línea en euros (con descuentos aplicados); negativo solo si es un descuento suelto. */
      amount: z.number(),
      category: z.enum(CATEGORY_IDS),
    }),
  ),
});
export type TicketRead = z.infer<typeof TicketRead>;

const SYSTEM = `Lees fotos de tickets de supermercado españoles (Mercadona, Lidl, Carrefour, Dia, Alcampo, Ahorramás, fruterías, etc.) para una app de cuentas de casa.

Devuelve:
- is_receipt: false si la imagen no es un ticket de compra o no se puede leer; explica entonces en problem, en una frase en español, qué pasa («La foto está borrosa», «No se ve el ticket entero»). Si se lee, problem = null.
- store: nombre comercial corto con mayúscula inicial («Mercadona», «Lidl», «Carrefour Express»), no la razón social.
- date: fecha de la compra en AAAA-MM-DD (los tickets la ponen como dd/mm/aaaa). null si no se ve.
- total: el TOTAL a pagar (no subtotales, base imponible ni IVA). null si no se ve.
- payment: «amex» si pone AMERICAN EXPRESS o AMEX; «tarjeta» si se pagó con otra tarjeta (VISA, MASTERCARD, TARJETA, contactless); «efectivo» si pone EFECTIVO o hay cambio/entregado; null si no se ve.
- lines: una por cada producto, en el orden del ticket.
  · text: el texto del producto como está impreso, sin el precio (p. ej. «LECHE ENTERA 6X1L», «PLATANO»). Si hay unidades o peso, añádelos al final: «PLATANO 1,254 kg», «YOGUR GRIEGO x2».
  · amount: el importe FINAL de esa línea en euros (unidades × precio ya multiplicado, el de la columna de importe). En España la coma es el decimal: «2,35» = 2.35.
  · Descuentos, ofertas y «2ª unidad» (líneas con importe negativo o «DTO», «DESCUENTO», «AHORRO»): réstalos del producto al que se aplican y no los pongas como línea aparte. Solo si no se sabe a qué producto se aplican, pon una línea con importe negativo y la categoría del producto de encima.
  · No incluyas como líneas: subtotales, TOTAL, desglose de IVA, forma de pago, entregado, cambio, puntos, número de tarjeta ni mensajes.
  · Las bolsas son una línea más, en «otros».
  · La suma de las líneas debe ser igual al total; repasa los importes si no lo es.
  · category, una de estas (elige la más razonable para un supermercado español):
${SUPER_CATEGORIES.map((c) => `    - ${c.id}: ${c.name}`).join("\n")}
    Pistas: pan, bollos, galletas de desayuno y tartas → panaderia; leche, yogures, quesos, mantequilla, nata y huevos → lacteos; jamón, chorizo, pavo en lonchas y fiambres → embutidos; pollo, ternera, cerdo, hamburguesas → carnes; pescado fresco, gambas, surimi → pescados; arroz, pasta, legumbres, harina y frutos secos → legumbres; atún, tomate frito, aceitunas, sopas y salsas envasadas → conservas; agua, refrescos, zumos, cerveza, vino, café e infusiones → bebidas; patatas fritas, chocolate, golosinas, helados de capricho → snacks; detergente, lavavajillas, papel de cocina, bolsas de basura → limpieza; champú, gel, papel higiénico, pañales, compresas, cremas → higiene; productos congelados (verdura congelada, pizzas, croquetas) → congelados; aceite, sal, azúcar, especias, comida de mascota y lo que no encaje → otros.`;

let client: Anthropic | null = null;

export type TicketImage = { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

export async function readTicket(image: TicketImage): Promise<TicketRead> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // Si el modelo rechazara la petición, el servidor reintenta con otro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(TicketRead) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: "Lee este ticket." },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return { is_receipt: false, problem: "No se ha podido leer el ticket.", store: null, date: null, total: null, payment: null, lines: [] };
  }
  return response.parsed_output;
}
