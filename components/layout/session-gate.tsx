import { getSession } from "@/lib/data";

/** Exige sesión con rol válido antes de mostrar su contenido. Usar dentro de <Suspense>. */
export async function SessionGate({ children }: { children: React.ReactNode }) {
  await getSession();
  return <>{children}</>;
}
