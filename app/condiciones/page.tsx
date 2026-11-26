import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Condiciones de uso" };

export default function CondicionesPage() {
  return (
    <LegalPage title="Condiciones de uso" updated="26 de noviembre de 2026">
      <p>
        Finanzas Casa es una herramienta privada, sin ánimo de lucro, para que las personas de un único hogar lleven sus
        cuentas. No se ofrece al público ni tiene coste.
      </p>
      <h2>Quién puede usarla</h2>
      <p>Solo los usuarios invitados por el administrador del hogar. Cada uno es responsable de guardar su contraseña.</p>
      <h2>Conexión con el banco</h2>
      <ul>
        <li>Es opcional y solo de lectura: sirve para traer los movimientos de las cuentas propias.</li>
        <li>La da y la retira el titular de la cuenta; se hace a través de Enable Banking (PSD2).</li>
        <li>La app no puede ordenar pagos ni transferencias.</li>
      </ul>
      <h2>Sin garantías</h2>
      <p>
        Las cifras de la app son orientativas y dependen de los datos que facilitan los bancos y de lo que apuntan los
        usuarios. Para cualquier dato oficial, manda lo que diga el banco.
      </p>
      <h2>Cambios</h2>
      <p>Estas condiciones pueden cambiar; la fecha de arriba indica la última versión.</p>
    </LegalPage>
  );
}
