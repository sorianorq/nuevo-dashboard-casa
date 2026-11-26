import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Privacidad" };

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad" updated="26 de noviembre de 2026">
      <p>
        Finanzas Casa es una aplicación privada para llevar las cuentas de un único hogar. No está abierta al público: solo
        pueden entrar las personas de ese hogar, con usuario y contraseña.
      </p>
      <h2>Qué datos se tratan</h2>
      <ul>
        <li>El correo electrónico de cada usuario, para iniciar sesión.</li>
        <li>Los movimientos de las cuentas bancarias del hogar (fecha, descripción, importe y saldo), los presupuestos y las compras que se apuntan en la app.</li>
        <li>
          Si un usuario conecta su banco: el nombre de cada cuenta y los últimos 4 dígitos de su número. El número completo
          no se guarda.
        </li>
        <li>Las fotos de los tickets de compra que se suban.</li>
      </ul>
      <h2>Conexión con el banco</h2>
      <p>
        La conexión con los bancos se hace a través de Enable Banking Oy, proveedor autorizado de servicios de información
        sobre cuentas (PSD2). El acceso es solo de lectura: la app no puede hacer pagos ni mover dinero. El permiso lo da
        el propio titular en la web de su banco, dura como máximo 180 días y se puede retirar en cualquier momento desde la
        app o desde el banco.
      </p>
      <h2>Para qué se usan</h2>
      <p>
        Únicamente para que el hogar vea y organice sus propias cuentas. Los datos no se venden, no se ceden a terceros y
        no se usan para publicidad ni para elaborar perfiles.
      </p>
      <h2>Dónde se guardan</h2>
      <p>
        En una base de datos privada (Supabase) con acceso restringido a los usuarios del hogar, y la app se sirve desde
        Vercel. Para leer las fotos de los tickets se usa un servicio de inteligencia artificial (Anthropic) que no conserva
        las imágenes para entrenar modelos.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Cada usuario puede pedir al administrador del hogar que consulte, corrija o borre sus datos, y desconectar su banco
        en cualquier momento.
      </p>
    </LegalPage>
  );
}
