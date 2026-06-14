import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
