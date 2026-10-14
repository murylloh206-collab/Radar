import "server-only";

export interface WishlistCategory {
  id: string;
  name: string;
  priority: "alta" | "media" | "menor";
  terms: string[];
}

/**
 * LISTA PRÉ-DEFINIDA DE CATEGORIAS E PRODUTOS DE ALTO VALOR AGREGADO E DESEJO
 * ---------------------------------------------------------------------------
 * Substitui buscas genéricas por termos estratégicos com alto interesse de compra:
 * - Smartphones
 * - Notebooks
 * - Consoles
 * - Eletroportáteis premium
 * - Ferramentas
 * - Áudio
 * - Suplementos líderes
 * - Tênis de marca e moda fitness
 */
export const DESIRED_CATEGORIES: WishlistCategory[] = [
  // 1. Smartphones de Alto Desejo
  {
    id: "smartphones",
    name: "Smartphones",
    priority: "alta",
    terms: [
      "smartphone 5g",
      "iphone 13",
      "iphone 14",
      "samsung galaxy s23",
      "samsung galaxy s24",
      "xiaomi poco x6",
      "motorola edge",
    ],
  },
  // 2. Notebooks e Computação
  {
    id: "notebooks",
    name: "Notebooks",
    priority: "alta",
    terms: [
      "notebook dell inspiron",
      "notebook lenovo ideapad",
      "notebook acer aspire",
      "macbook air m1",
      "notebook gamer",
    ],
  },
  // 3. Consoles e Games
  {
    id: "consoles-games",
    name: "Consoles",
    priority: "alta",
    terms: [
      "playstation 5",
      "nintendo switch oled",
      "xbox series s",
      "controle dualsense ps5",
      "controle xbox series",
    ],
  },
  // 4. Eletroportáteis Premium
  {
    id: "eletrodomesticos-premium",
    name: "Eletroportáteis premium",
    priority: "alta",
    terms: [
      "air fryer mondial",
      "air fryer philco",
      "cafeteira nespresso",
      "cafeteira tres coracoes",
      "aspirador robo",
      "liquidificador arno",
      "liquidificador philips walita",
    ],
  },
  // 5. Ferramentas Elétricas e Manuais de Linha Profissional
  {
    id: "ferramentas",
    name: "Ferramentas",
    priority: "media",
    terms: [
      "parafusadeira bosch",
      "parafusadeira makita",
      "serra circular",
      "lavadora alta pressao karcher",
      "furadeira de impacto bosch",
      "maleta de ferramentas",
    ],
  },
  // 6. Áudio e Caixas de Som
  {
    id: "audio",
    name: "Áudio",
    priority: "media",
    terms: [
      "caixa jbl flip",
      "caixa jbl charge",
      "fone jbl tune",
      "fone sony wh",
      "soundbar samsung",
      "fone bluetooth cancelamento ruido",
    ],
  },
  // 7. Suplementação Esportiva Consolidada
  {
    id: "suplementos",
    name: "Suplementos",
    priority: "media",
    terms: [
      "creatina max titanium",
      "whey dux 900g",
      "whey max titanium",
      "creatina integralmedica",
    ],
  },
  // 8. Tênis de Marca Oficiais
  {
    id: "tenis-marcas",
    name: "Tênis de Marca",
    priority: "alta",
    terms: [
      "tenis olympikus",
      "tenis puma",
      "tenis asics",
      "tenis fila",
      "tenis nike corrida",
      "tenis adidas running",
    ],
  },
  // 9. Moda Fitness e Roupas de Treino
  {
    id: "moda-fitness-casual",
    name: "Roupas e Moda Fitness",
    priority: "alta",
    terms: [
      "camiseta adidas masculina",
      "bermuda nike masculina",
      "legging fitness feminina",
      "camiseta academia masculina",
      "bermuda treino masculina",
    ],
  },
  // 10. Perfumaria e Beleza
  {
    id: "beleza-cuidados",
    name: "Beleza e Cuidados Pessoais",
    priority: "menor",
    terms: [
      "perfume malbec",
      "perfume kaiak",
      "protetor solar la roche posay",
      "perfume egeo",
    ],
  },
];
