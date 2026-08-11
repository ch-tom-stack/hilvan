import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El endpoint /api/agent/crm/reglas sirve las reglas del CRM leyéndolas de
  // docs/crm/*.md. Sin incluirlas en la traza, el bundle serverless no las
  // lleva: funcionaría en local y fallaría en producción.
  outputFileTracingIncludes: {
    '/api/agent/crm/reglas': ['./docs/crm/reglas-*.md'],
  },
  async redirects() {
    return [
      {
        source: "/rendiciones",
        destination: "/costos",
        permanent: true,
      },
      {
        source: "/rendiciones/admin",
        destination: "/costos/admin",
        permanent: true,
      },
      {
        source: "/rendiciones/mensual",
        destination: "/costos/mensual",
        permanent: true,
      },
      {
        source: "/rendiciones/admin/export",
        destination: "/costos/admin/export",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
