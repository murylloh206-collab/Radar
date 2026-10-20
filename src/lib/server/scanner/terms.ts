import "server-only";

export interface WishlistCategory {
  id: string;
  name: string;
  priority: "alta" | "media" | "menor";
  terms: string[];
}

/**
 * LISTA PRÉ-DEFINIDA DE CATEGORIAS E PRODUTOS DE ALTO DESEJO E VALOR ACESSÍVEL
 * ---------------------------------------------------------------------------
 * Prioriza produtos com alta taxa de conversão e faixa de preço acessível (R$ 80 a R$ 450):
 * - Eletroportáteis para o lar (Air Fryers, Cafeteiras, Liquidificadores)
 * - Suplementação Esportiva (Creatina, Whey, DUX)
 * - Tênis de Marca Oficiais (Olympikus, Puma, Fila, Asics, Adidas)
 * - Moda Fitness e Treino
 * - Perfumaria e Beleza
 * - Áudio e Fones
 * - Ferramentas elétricas úteis
 */
export const DESIRED_CATEGORIES: WishlistCategory[] = [
  // 1. Eletroportáteis para o Lar (Campeões de Vendas)
  {
    id: "eletrodomesticos-premium",
    name: "Eletroportáteis",
    priority: "alta",
    terms: [
      "air fryer mondial",
      "air fryer philco",
      "cafeteira tres coracoes",
      "cafeteira nespresso",
      "liquidificador arno",
      "liquidificador philips walita",
      "sanduicheira grill",
      "aspirador de po vertical",
    ],
  },
  // 2. Suplementação Esportiva Consolidada
  {
    id: "suplementos",
    name: "Suplementos",
    priority: "alta",
    terms: [
      "creatina max titanium",
      "whey dux 900g",
      "whey max titanium",
      "creatina integralmedica",
      "creatina soldiers 500g",
      "whey protein isolado",
    ],
  },
  // 3. Tênis de Marca Oficiais
  {
    id: "tenis-marcas",
    name: "Tênis de Marca",
    priority: "alta",
    terms: [
      "tenis olympikus",
      "tenis puma",
      "tenis fila",
      "tenis asics",
      "tenis adidas running",
      "tenis nike masculino",
    ],
  },
  // 4. Moda Fitness e Roupas de Treino
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
      "cueca calvin klein",
    ],
  },
  // 5. Perfumaria e Beleza
  {
    id: "beleza-cuidados",
    name: "Beleza e Cuidados Pessoais",
    priority: "alta",
    terms: [
      "perfume malbec",
      "perfume kaiak",
      "protetor solar la roche posay",
      "perfume egeo",
      "protetor solar nivea",
      "perfume importado masculino",
    ],
  },
  // 6. Áudio e Fones Bluetooth
  {
    id: "audio",
    name: "Áudio",
    priority: "media",
    terms: [
      "fone jbl tune",
      "caixa jbl flip",
      "fone bluetooth cancelamento ruido",
      "fone jbl wave",
      "caixa de som jbl",
    ],
  },
  // 7. Ferramentas Elétricas para Casa e Trabalho
  {
    id: "ferramentas",
    name: "Ferramentas",
    priority: "media",
    terms: [
      "parafusadeira bosch",
      "parafusadeira makita",
      "furadeira de impacto",
      "maleta de ferramentas completa",
      "serra tico tico",
    ],
  },
  // 8. Eletrônicos e Games (Acessórios e Periféricos)
  {
    id: "consoles-games",
    name: "Games e Periféricos",
    priority: "menor",
    terms: [
      "controle xbox series",
      "controle dualsense ps5",
      "controle 8bitdo",
      "mouse gamer logitech",
      "teclado mecanico gamer",
    ],
  },
  // 9. Smartphones Acessíveis
  {
    id: "smartphones",
    name: "Smartphones Acessíveis",
    priority: "menor",
    terms: [
      "smartphone 128gb",
      "smartphone motorola moto g",
      "smartphone xiaomi redmi",
    ],
  },
  // 10. Notebooks e Periféricos
  {
    id: "notebooks",
    name: "Notebooks",
    priority: "menor",
    terms: [
      "mochila notebook executiva",
      "suporte notebook articulado",
      "base cooler notebook",
    ],
  },
];
