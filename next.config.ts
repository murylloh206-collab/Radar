import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acesso dev através de IPs locais/redes
  allowedDevOrigins: ["54.232.189.113", "localhost", "127.0.0.1"],
  // Imagens dos produtos vêm do CDN oficial do Mercado Livre.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.mlstatic.com" },
      { protocol: "http", hostname: "**.mlstatic.com" },
    ],
  },
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
