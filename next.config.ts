import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Redirecciones fijas (sin datos de la petición).
  async redirects() {
    return [
      { source: "/", destination: "/resumen", permanent: false },
      { source: "/contabilidad", destination: "/contabilidad/balances", permanent: false },
      { source: "/pagos", destination: "/pagos/amex", permanent: false },
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
