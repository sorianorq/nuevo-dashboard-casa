import Link from "next/link";
import { Logo } from "@/components/layout/logo";

/** Página pública de texto (privacidad, condiciones): sin sesión ni datos. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/login" className="mb-8 inline-flex">
        <Logo />
      </Link>
      <article className="fc-float space-y-4 p-6 text-[15px] leading-relaxed sm:p-8 [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-bold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Última actualización: {updated}</p>
        {children}
      </article>
    </main>
  );
}
