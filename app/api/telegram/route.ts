import { timingSafeEqual } from "node:crypto";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/bot";

/**
 * Webhook del bot de Telegram. Telegram envía la clave secreta que se dio al
 * registrar el webhook en la cabecera X-Telegram-Bot-Api-Secret-Token: sin
 * ella no se hace nada. Siempre responde 200 para que Telegram no reintente
 * (los errores se avisan en el chat o quedan en el registro).
 */
export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return new Response("No autorizado", { status: 401 });
  }
  try {
    const update = (await request.json()) as TgUpdate;
    await handleUpdate(update);
  } catch (e) {
    console.error("Bot de Telegram:", e);
  }
  return Response.json({ ok: true });
}
