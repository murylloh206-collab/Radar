import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
