import { getSession, removeTicketPhoto, uploadPendingTicket } from "@/lib/data";
import { readTicket } from "@/lib/supermarket/ticket";

/**
 * Leer un ticket: recibe la foto (JPEG ya reducida en el móvil), la guarda
 * como pendiente en el almacén privado «tickets» y la lee con Claude.
 * Devuelve la ruta de la foto y lo leído; la compra se guarda después.
 * Ruta (no acción de servidor) porque la foto puede pasar de 1 MB.
 */
export const maxDuration = 90;

const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await getSession();
  } catch {
    return Response.json({ ok: false, error: "Vuelve a entrar en la app." }, { status: 401 });
  }
  let path: string | null = null;
  try {
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.type !== "image/jpeg") {
      return Response.json({ ok: false, error: "Foto no válida." }, { status: 400 });
    }
    if (photo.size > MAX_BYTES) return Response.json({ ok: false, error: "La foto es demasiado grande." }, { status: 413 });
    const bytes = await photo.arrayBuffer();
    path = await uploadPendingTicket(bytes);
    const read = await readTicket({ data: Buffer.from(bytes).toString("base64"), mediaType: "image/jpeg" });
    if (!read.is_receipt || read.lines.length === 0) {
      await removeTicketPhoto(path);
      return Response.json({ ok: false, error: read.problem ?? "No parece un ticket de compra. Prueba con otra foto." });
    }
    return Response.json({ ok: true, path, read });
  } catch (e) {
    console.error("Leer ticket:", e);
    if (path) await removeTicketPhoto(path).catch(() => {});
    const message = e instanceof Error ? e.message : "";
    return Response.json({ ok: false, error: /script 15|permiso/i.test(message) ? message : "No se pudo leer el ticket. Inténtalo otra vez." });
  }
}
