import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acesso dev através de IPs locais/redes
  allowedDevOrigins: ["54.232.189.113", "localhost", "127.0.0.1"],
  // Imagens dos produtos vêm dos CDNs oficiais do Mercado Livre e da Shopee.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.mlstatic.com" },
      { protocol: "http", hostname: "**.mlstatic.com" },
      { protocol: "https", hostname: "**.shopee.com.br" },
      { protocol: "http", hostname: "**.shopee.com.br" },
      { protocol: "https", hostname: "**.shopee.com" },
      { protocol: "http", hostname: "**.shopee.com" },
      { protocol: "https", hostname: "**.susercontent.com" },
      { protocol: "http", hostname: "**.susercontent.com" },
      { protocol: "https", hostname: "**.shopeesz.com" },
      { protocol: "https", hostname: "**.akamaized.net" },
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
