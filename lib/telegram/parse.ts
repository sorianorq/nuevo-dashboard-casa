import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * Entiende un mensaje libre de gasto («25,50 Mercadona amex», «ayer 12 €
 * parking», «gasolina 60 bankinter 18/11») con Claude y salida estructurada.
 */

export const ParsedExpense = z.object({
  /** false si el mensaje no es un gasto o falta el importe. */
  understood: z.boolean(),
  /** Importe en euros, positivo, con céntimos (25.5). */
  amount: z.number().nullable(),
  /** Qué / dónde, corto y tal como lo diría la persona: «Mercadona», «Parking». */
  description: z.string(),
  /** Fecha del gasto AAAA-MM-DD (hoy si no se dice). */
  date: z.string(),
  /** true si dice que se pagó con la Amex / American Express. */
  amex: z.boolean(),
  /** Medio de pago si lo dice y no es la Amex («efectivo», «bankinter»…); si no, null. */
  payment_method: z.string().nullable(),
  /** Si no se entiende: pregunta breve en español para pedir lo que falta. */
  question: z.string().nullable(),
});
export type ParsedExpense = z.infer<typeof ParsedExpense>;

const SYSTEM = `Extraes gastos domésticos de mensajes cortos en español que alguien escribe en Telegram para apuntarlos en su contabilidad.

Devuelve:
- amount: el importe en euros como número positivo. En español la coma es el decimal: «25,50» = 25.5 y «1.200» = 1200. Si hay varios números, el importe es el que va con «€», «euros» o el que tiene sentido como precio; una fecha («18/11») no es un importe.
- description: qué se compró o dónde, en pocas palabras y con mayúscula inicial, sin el importe, la fecha ni el medio de pago («Mercadona», «Gasolina», «Cena con amigos»).
- date: AAAA-MM-DD. Usa la fecha de hoy que se indica si el mensaje no dice otra; resuelve «ayer», «anteayer», «el lunes» (el más reciente pasado) y fechas como «18/11» (dd/mm, año actual; si quedaría en el futuro, el año anterior).
- amex: true solo si dice «amex», «american», «american express» o «con la tarjeta amex».
- payment_method: si menciona otro medio de pago («efectivo», «bankinter», «revolut», «bizum», «tarjeta»), ese texto en minúsculas; si no, null.
- understood: false si no es un gasto o no hay importe; entonces pon en question una pregunta breve y amable pidiendo lo que falta. Si se entiende, question = null.`;

let client: Anthropic | null = null;

export async function parseExpense(text: string, today: string): Promise<ParsedExpense> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    // Si el modelo rechazara la petición, el servidor reintenta con otro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ParsedExpense) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Hoy es ${today}.\n\nMensaje: ${text}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return {
      understood: false,
      amount: null,
      description: "",
      date: today,
      amex: false,
      payment_method: null,
      question: "No lo he entendido. Escribe el importe y qué es, por ejemplo: «25,50 Mercadona amex».",
    };
  }
  return response.parsed_output;
}
