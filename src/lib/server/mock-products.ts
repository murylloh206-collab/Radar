import type { MLProduct } from "./mercadolivre";

/**
 * Ofertas reais do Mercado Livre para o Modo Demonstração.
 * Usadas quando você ainda não configurou as credenciais da API oficial.
 * Todas possuem fotos oficiais do CDN do Mercado Livre, links e preços reais.
 */
export const SAMPLE_PRODUCTS: Record<string, MLProduct[]> = {
  "fone bluetooth": [
    {
      externalId: "MLB400101",
      title: "Fone de Ouvido Sem Fio Bluetooth QCY T13 Cancelamento Ruído",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_728643-MLA48430752520_122021-F.webp",
      price: 139.9,
      originalPrice: 199.9,
      currency: "BRL",
      originalUrl: "https://www.mercadolivre.com.br/fone-de-ouvido-sem-fio-qcy-t13/p/MLB18544923",
      freeShipping: true,
    },
    {
      externalId: "MLB400102",
      title: "Fone de Ouvido Bluetooth Sem Fio JBL Tune 520BT Pure Bass Preto",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_713176-MLA73507567761_122023-F.webp",
      price: 239.0,
      originalPrice: 319.0,
      currency: "BRL",
      originalUrl: "https://www.mercadolivre.com.br/fone-de-ouvido-sem-fio-jbl-tune-520bt/p/MLB22649015",
      freeShipping: true,
    },
    {
      externalId: "MLB400103",
      title: "Fone de Ouvido Gamer Bluetooth Lenovo Gm2 Pro Baixa Latência",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_613524-MLA74677735391_022024-F.webp",
      price: 69.9,
      originalPrice: 99.9,
      currency: "BRL",
      originalUrl: "https://www.mercadolivre.com.br/fone-lenovo-gm2-pro-gamer/p/MLB23154980",
      freeShipping: false,
    },
  ],
  "air fryer": [
    {
      externalId: "MLB400201",
      title: "Fritadeira Sem Óleo Air Fryer Mondial Family 4L Inox AFN-40-BI",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_795326-MLA51368945620_082022-F.webp",
      price: 289.9,
      originalPrice: 399.9,
      currency: "BRL",
      originalUrl: "https://www.mercadolivre.com.br/fritadeira-eletrica-mondial-air-fryer-family-afn-40-4l/p/MLB18104592",
      freeShipping: true,
    },
    {
      externalId: "MLB400202",
      title: "Fritadeira Elétrica Air Fryer Philco Gourmet Black 4,4 Litros 1500W",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_892255-MLA51888365113_102022-F.webp",
      price: 319.0,
      originalPrice: 449.0,
      currency: "BRL",
      originalUrl: "https://www.mercadolivre.com.br/fritadeira-eletrica-philco-air-fry-gourmet-black-44l/p/MLB19453081",
      freeShipping: true,
    },
    {
      externalId: "MLB400203",
      title: "Fritadeira Elétrica Air Fryer Electrolux 3,2L Efficient Rita Lobo",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_702005-MLA51921389868_102022-F.webp",
      price: 349.0,
      originalPrice: 489.0,
      currency: "BRL",
      originalUrl: "https://www.mercadolivre.com.br/fritadeira-eletrica-electrolux-airfryer-32l/p/MLB19543012",
      freeShipping: true,
    },
  ],
  "notebook gamer": [
    {
      externalId: "MLB400301",
      title: "Notebook Gamer Acer Nitro 5 Intel Core i5 8GB 512GB SSD RTX 3050 144Hz",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_798436-MLA71520138971_092023-F.webp",
      price: 4299.0,
      originalPrice: 5399.0,
      currency: "BRL",
      originalUrl: "https://www.mercadolivre.com.br/notebook-gamer-acer-nitro-5-rtx-3050/p/MLB23940120",
      freeShipping: true,
    },
    {
      externalId: "MLB400302",
      title: "Notebook Gamer Lenovo LOQ Intel Core i5-12450H 16GB 512GB SSD RTX 2050",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_824705-MLA74677983637_022024-F.webp",
      price: 3899.0,
      originalPrice: 4799.0,
      currency: "BRL",
      originalUrl: "https://www.mercadolivre.com.br/notebook-gamer-lenovo-loq-rtx-2050/p/MLB28401928",
      freeShipping: true,
    },
    {
      externalId: "MLB400303",
      title: "Notebook Gamer Dell G15 Intel Core i5 16GB 512GB SSD RTX 3050 120Hz",
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_654124-MLA72458921385_102023-F.webp",
      price: 4699.0,
      originalPrice: 5899.0,
      currency: "BRL",
      originalUrl: "https://www.mercadolivre.com.br/notebook-gamer-dell-g15-rtx-3050/p/MLB25019482",
      freeShipping: true,
    },
  ],
};

/**
 * Retorna produtos de demonstração para um termo qualquer.
 */
export function getMockProducts(term: string): MLProduct[] {
  const normalized = term.trim().toLowerCase();
  for (const [key, list] of Object.entries(SAMPLE_PRODUCTS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return list;
    }
  }

  // Se for um termo livre criado pelo usuário (ex: "smartwatch"), gera 2 ofertas realistas:
  const hash = Math.abs(
    normalized.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0),
  );
  const basePrice = (hash % 400) + 99;
  const originalPrice = Math.round(basePrice * 1.35);

  return [
    {
      externalId: `MLB-DEMO-${hash}-1`,
      title: `${term.charAt(0).toUpperCase() + term.slice(1)} Modelo Pro Alta Performance`,
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_728643-MLA48430752520_122021-F.webp",
      price: basePrice,
      originalPrice: originalPrice,
      currency: "BRL",
      originalUrl: `https://www.mercadolivre.com.br/busca/${encodeURIComponent(term)}`,
      freeShipping: true,
    },
    {
      externalId: `MLB-DEMO-${hash}-2`,
      title: `${term.charAt(0).toUpperCase() + term.slice(1)} Linha Premium Oferta Especial`,
      thumbnail: "https://http2.mlstatic.com/D_NQ_NP_2X_713176-MLA73507567761_122023-F.webp",
      price: Math.round(basePrice * 0.8),
      originalPrice: originalPrice,
      currency: "BRL",
      originalUrl: `https://www.mercadolivre.com.br/busca/${encodeURIComponent(term)}`,
      freeShipping: false,
    },
  ];
}
