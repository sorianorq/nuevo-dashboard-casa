import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activateBankSession, dropBankSession, findPendingBankSession } from "@/lib/data";
import { BankError, createSession } from "@/lib/banking/enable-banking";

/**
 * Vuelta del banco (Enable Banking redirige aquí con ?code&state, o ?error).
 * El `state` se busca entre las idas pendientes del usuario con sesión (RLS):
 * una vuelta ajena o repetida no encuentra nada.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const back = (q: string) => NextResponse.redirect(new URL(`/movimientos/bancos?${q}`, url.origin));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || state.length > 100) return back("error=vuelta");

  let pending: Awaited<ReturnType<typeof findPendingBankSession>>;
  try {
    pending = await findPendingBankSession(state);
  } catch (e) {
    console.error(e);
    return back("error=banco");
  }
  if (!pending) return back("error=vuelta");

  if (!code || url.searchParams.get("error")) {
    await dropBankSession(pending.id).catch((e) => console.error(e));
    return back("error=cancelado");
  }

  try {
    const s = await createSession(code, {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: request.headers.get("user-agent"),
    });
    await activateBankSession(pending.id, s);
    return back(`conectado=${pending.id}`);
  } catch (e) {
    console.error(e);
    await dropBankSession(pending.id).catch((err) => console.error(err));
    return back(`error=${e instanceof BankError && e.expired ? "permiso" : "banco"}`);
  }
}
