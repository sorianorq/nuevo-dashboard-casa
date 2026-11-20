import "server-only";

/** Llamadas mínimas a la API de bots de Telegram (texto plano, sin formato). */

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string };
export type Keyboard = InlineButton[][];

async function call(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  // «message is not modified» no es un error real (pulsar dos veces un botón).
  if (!json?.ok && !/not modified/i.test(json?.description ?? "")) {
    console.error(`Telegram ${method}:`, json?.description ?? res.status);
  }
  return json;
}

export function sendMessage(chatId: number, text: string, keyboard?: Keyboard) {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function editMessage(chatId: number, messageId: number, text: string, keyboard?: Keyboard) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

export function answerCallback(callbackId: string, text?: string) {
  return call("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });
}
