import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Redirecciones fijas (sin datos de la petición).
  async redirects() {
    return [
      { source: "/", destination: "/resumen", permanent: false },
      { source: "/contabilidad", destination: "/contabilidad/balances", permanent: false },
      // Pagos era American Express + Pagos; ahora una pantalla con selector.
      { source: "/pagos/amex", destination: "/pagos?ver=amex", permanent: false },
      { source: "/pagos/personales", destination: "/pagos", permanent: false },
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
