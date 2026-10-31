import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  async redirects() {
    return [
      {
        source: '/gerar-postagem',
        destination: '/criar-conteudo?aba=oferta-link',
        permanent: false,
      },
      {
        source: '/mensagem-avulsa',
        destination: '/criar-conteudo?aba=mensagem-livre',
        permanent: false,
      },
      {
        source: '/stories',
        destination: '/criar-conteudo?aba=story',
        permanent: false,
      },
      {
        source: '/agenda',
        destination: '/envios?aba=agenda',
        permanent: false,
      },
      {
        source: '/analytics',
        destination: '/resultados?aba=grupos',
        permanent: false,
      },
      {
        source: '/relatorios',
        destination: '/resultados?aba=vendas',
        permanent: false,
      },
      {
        source: '/bio-link',
        destination: '/pagina-publica',
        permanent: false,
      },
      {
        source: '/conexao-whatsapp',
        destination: '/conexoes?aba=whatsapp',
        permanent: false,
      },
      {
        source: '/conectar-lojas',
        destination: '/conexoes?aba=lojas',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
