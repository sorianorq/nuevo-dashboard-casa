import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Redirecciones fijas (sin datos de la petición).
  async redirects() {
    return [
      { source: "/", destination: "/resumen", permanent: false },
      { source: "/contabilidad", destination: "/contabilidad/balances", permanent: false },
      // Movimientos (banco + gastos a mano + Amex) sustituye a Pagos y sale de Contabilidad.
      { source: "/contabilidad/movimientos/cargar", destination: "/movimientos/extractos", permanent: false },
      { source: "/contabilidad/movimientos/:path*", destination: "/movimientos/:path*", permanent: false },
      { source: "/pagos/amex", destination: "/movimientos?ver=amex", permanent: false },
      { source: "/pagos/personales", destination: "/movimientos?balance=personal", permanent: false },
      { source: "/pagos", destination: "/movimientos?balance=personal", permanent: false },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
