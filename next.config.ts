import type { NextConfig } from "next";

// En desarrollo, /api/py/* va al optimizador local (uvicorn en el puerto 8000).
// En Vercel, /api/py/* lo atiende la función de Python api/index.py.
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/py/:path*",
        destination: process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api/py/:path*" : "/api/",
      },
    ];
  },
};

export default nextConfig;
