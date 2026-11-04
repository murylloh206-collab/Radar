/**
 * Gerador inteligente de ganchos de abertura para o Radar de Ofertas.
 * 
 * Produz chamadas comerciais atrativas, contextuais e variadas por categoria,
 * com exatamente 1 único gancho por oferta, sem termos como 'achadinhos' ou 'achado',
 * e sem promessas falsas de escassez.
 */

export type ProductHookCategory =
  | 'caixa_de_som'
  | 'suplementos'
  | 'tenis'
  | 'smartphones'
  | 'eletronicos'
  | 'games'
  | 'roupas'
  | 'relogios'
  | 'perfumes'
  | 'ferramentas'
  | 'eletrodomesticos'
  | 'automotivo'
  | 'beleza'
  | 'geral';

interface CategoryKeywords {
  category: ProductHookCategory;
  patterns: RegExp[];
}

const CATEGORY_MAP: CategoryKeywords[] = [
  {
    category: 'caixa_de_som',
    patterns: [
      /caixa\s+(?:de\s+)?som/i,
      /soundbar/i,
      /partybox/i,
      /boombox/i,
      /jbl\s+(?:flip|charge|boombox|partybox|go|clip)/i,
      /alto[- ]falante/i,
      /echo\s+dot/i,
      /echo\s+pop/i,
      /alexa/i,
    ],
  },
  {
    category: 'suplementos',
    patterns: [
      /creatina/i,
      /whey/i,
      /prote[ií]na/i,
      /bcaa/i,
      /glutamina/i,
      /pr[eé][- ]treino/i,
      /albumina/i,
      /hipercal[oó]rico/i,
      /termog[eê]nico/i,
      /soldiers nutrition/i,
      /growth/i,
      /max titanium/i,
      /dark lab/i,
      /integralmedica/i,
    ],
  },
  {
    category: 'tenis',
    patterns: [
      /t[eê]nis/i,
      /chuteira/i,
      /sapatilha/i,
      /sneaker/i,
      /mizuno/i,
      /olympikus/i,
      /asics/i,
      /nike revolution/i,
      /adidas duramo/i,
      /sapato/i,
    ],
  },
  {
    category: 'smartphones',
    patterns: [
      /iphone/i,
      /galaxy\s+[as]\d+/i,
      /smartphone/i,
      /celular/i,
      /xiaomi/i,
      /redmi/i,
      /poco/i,
      /motorola/i,
      /moto\s+g/i,
    ],
  },
  {
    category: 'games',
    patterns: [
      /playstation/i,
      /ps5/i,
      /ps4/i,
      /xbox/i,
      /nintendo/i,
      /joystick/i,
      /controle sem fio/i,
      /headset gamer/i,
      /teclado mec[aâ]nico/i,
      /mouse gamer/i,
      /gamer/i,
    ],
  },
  {
    category: 'relogios',
    patterns: [
      /rel[oó]gio/i,
      /smartwatch/i,
      /galaxy watch/i,
      /apple watch/i,
      /amazfit/i,
      /orient/i,
      /casio/i,
    ],
  },
  {
    category: 'perfumes',
    patterns: [
      /perfume/i,
      /eau de parfum/i,
      /eau de toilette/i,
      /col[oô]nia/i,
      /fragr[aâ]ncia/i,
      /botic[aá]rio/i,
      /malbec/i,
      /zaad/i,
      /natura/i,
      /versace/i,
      /dior/i,
      /sauvage/i,
      /one million/i,
      /invictus/i,
    ],
  },
  {
    category: 'ferramentas',
    patterns: [
      /furadeira/i,
      /parafusadeira/i,
      /esmerilhadeira/i,
      /serra/i,
      /jogo de ferramentas/i,
      /maleta de ferramentas/i,
      /trena/i,
      /alicate/i,
      /martele/i,
      /lavadora de alta press[aã]o/i,
    ],
  },
  {
    category: 'eletrodomesticos',
    patterns: [
      /airfryer/i,
      /fritadeira/i,
      /liquidificador/i,
      /cafeteira/i,
      /micro-ondas/i,
      /aspirador/i,
      /ventilador/i,
      /geladeira/i,
      /fog[aã]o/i,
      /m[aá]quina de lavar/i,
      /lava e seca/i,
      /smart tv/i,
      /televis[aã]o/i,
    ],
  },
  {
    category: 'roupas',
    patterns: [
      /camiseta/i,
      /camisa/i,
      /bermuda/i,
      /cal[cç]a/i,
      /jaqueta/i,
      /moletom/i,
      /cueca/i,
      /meia/i,
      /vestido/i,
      /dry fit/i,
    ],
  },
  {
    category: 'automotivo',
    patterns: [
      /pneu/i,
      /óleo\s+(?:motor|lubrificante)/i,
      /automotivo/i,
      /palheta/i,
      /bateria\s+(?:heliar|moura)/i,
      /som automotivo/i,
      /câmera de ré/i,
    ],
  },
  {
    category: 'beleza',
    patterns: [
      /shampoo/i,
      /condicionador/i,
      /máscara capilar/i,
      /hidratante/i,
      /protetor solar/i,
      /sérum/i,
      /maquiagem/i,
      /batom/i,
      /secador de cabelo/i,
      /prancha/i,
    ],
  },
  {
    category: 'eletronicos',
    patterns: [
      /fone/i,
      /headphone/i,
      /bluetooth/i,
      /carregador/i,
      /power\s*bank/i,
      /câmera/i,
      /tablet/i,
      /notebook/i,
      /monitor/i,
    ],
  },
];

/**
 * Banco de ganchos profissionais e comerciais organizados por categoria.
 * Não utiliza termos como 'achado' ou 'achadinhos'. Mantém leitura direta e limpa.
 */
const HOOK_LIBRARY: Record<ProductHookCategory, string[]> = {
  caixa_de_som: [
    '🔥 CAIXA DE SOM COM UM EXCELENTE DESCONTO!',
    'CAIXA DE SOM COM PREÇO QUE MERECE ATENÇÃO! 🔥',
    'ÓTIMA OPORTUNIDADE PRA QUEM CURTE SOM DE QUALIDADE! 🔊',
    'POTÊNCIA E QUALIDADE DE SOM COM UM ÓTIMO PREÇO! 🎶',
    'ESSE MODELO BAIXOU O VALOR E VALE CONFERIR! 🔊',
  ],
  suplementos: [
    'CREATINA COM DESCONTO ESPECIAL! 💪',
    'PREÇO BOM PRA QUEM NÃO ABRE MÃO DA CREATINA! 💪',
    'OPORTUNIDADE CERTA PRA COMPLETAR SEU KIT DE TREINO! 💪',
    'ESSA PROMOÇÃO DE SUPLEMENTO MERECE SUA ATENÇÃO! 🔥',
    'EXCELENTE CUSTO-BENEFÍCIO PRA QUEM TREINA PESADO! 🏋️',
  ],
  tenis: [
    'ESSE TÊNIS ENTROU EM PROMOÇÃO! 👟',
    'PRA QUEM TAVA DE OLHO NESSE TÊNIS, VALE CONFERIR! 👟',
    'BOA OPORTUNIDADE PRA RENOVAR O CALÇADO NO PREÇO CERTO! 🔥',
    'ESSE MODELO COBROU UM VALOR QUE CHAMA ATENÇÃO! 👟',
    'CONFORTO E QUALIDADE COM UM DESCONTO QUE VALE A PENA! 🏃',
  ],
  smartphones: [
    'ÓTIMA OPORTUNIDADE PRA TROCAR DE CELULAR! 📱',
    'BOA CHANCE PRA QUEM QUERIA TROCAR DE SMARTPHONE! 📱',
    'ESSE PREÇO NO CELULAR MERECE UMA OLHADA ATENTA! 🔥',
    'UM VALOR BEM MAIS ACESSÍVEL PRA ESSE APARELHO HOJE! 📲',
    'OPORTUNIDADE INTERESSANTE PRA QUEM BUSCA TECNOLOGIA! 🚀',
  ],
  games: [
    'DE OLHO NO SETUP? ESSA PROMOÇÃO VALE CONFERIR! 🎮',
    'EXCELENTE ESCOLHA PRA QUEM CURTE JOGAR COM QUALIDADE! 🕹️',
    'ESSE ACESSÓRIO BAIXOU O PREÇO E VALE APROVEITAR! 🔥',
    'DESCONTO INTERESSANTE PRA COMPLETAR SEU CANTINHO GAMER! 🎮',
  ],
  relogios: [
    'ESSE RELÓGIO FICOU COM UM VALOR DIFERENCIADO HOJE! ⌚',
    'DETALHES QUE FAZEM DIFERENÇA COM UM ÓTIMO PREÇO! ✨',
    'OPORTUNIDADE ELEGANTE PRA QUEM CURTE UM BOM RELÓGIO! ⌚',
    'COMBINAÇÃO DE ESTILO E ECONOMIA QUE VALE A PENA! 🔥',
  ],
  perfumes: [
    'SEU PERFUME FAVORITO APARECEU COM UM DESCONTO FORTE! ✨',
    'EXCELENTE CHANCE PRA RENOVAR SUA FRAGRÂNCIA PREFERIDA! 💎',
    'VALE MUITO A PENA CONFERIR ESSE PREÇO HOJE! 🌟',
    'CHEIROSO E PAGANDO MENOS: ESSA VALE O CLIQUE! 🔥',
  ],
  ferramentas: [
    'OPORTUNIDADE CERTA PRA QUEM PRECISA DE FERRAMENTA BOA! 🛠️',
    'QUALIDADE PRA TRABALHAR COM O PREÇO LÁ EMBAIXO! ⚡',
    'ESSE EQUIPAMENTO APARECEU COM UM VALOR QUE VALE APROVEITAR! 🔧',
    'PRA EQUIPAR A OFICINA OU CASA PAGANDO BEM MENOS! 🔨',
  ],
  eletrodomesticos: [
    'PRATICIDADE PRA CASA COM UM PREÇO QUE VALE A PENA! 🏠',
    'BOA OPORTUNIDADE PRA GARANTIR ESSE ELETRO HOJE! 🔥',
    'ESSE ITEM FACILITA SUA ROTINA E FICOU MAIS BARATO! 💡',
    'DESCONTO INTERESSANTE PRA EQUIPAR SUA COZINHA OU CASA! ✨',
  ],
  roupas: [
    'BOA OPORTUNIDADE PRA RENOVAR O GUARDA-ROUPA! 👕',
    'PEÇA CONFORTÁVEL COM UM VALOR MUITO ACESSÍVEL HOJE! ✨',
    'ROUPA DE QUALIDADE PRA RENOVAR O VISUAL PAGANDO MENOS! 🔥',
    'PREÇO INTERESSANTE PRA GARANTIR MAIS UMA PEÇA CORINGA! 👔',
  ],
  automotivo: [
    'CUIDAR DO CARRO PAGANDO MENOS: VALE CONFERIR ESSA! 🚗',
    'OPORTUNIDADE PRA GARANTIR ESSE ITEM AUTOMOTIVO HOJE! 🔧',
    'DESCONTO ÚTIL PRA MANUTENÇÃO DO SEU VEÍCULO! 🚙',
  ],
  beleza: [
    'SEUS CUIDADOS DIÁRIOS COM UM PREÇO BEM MAIS EM CONTA! 💅',
    'BOA CHANCE PRA GARANTIR ESSE PRODUTO DE CUIDADO PESSOAL! ✨',
    'CUIDAR DE VOCÊ PAGANDO MENOS É SEMPRE UMA BOA! 🧴',
  ],
  eletronicos: [
    'ESSE PREÇO NO FONE MERECE ATENÇÃO! 🔥',
    'UM DESCONTO INTERESSANTE PRA QUEM CURTE TECNOLOGIA! 🎧',
    'BOA OPORTUNIDADE PRA QUEM PRECISA DE UM ELETRÔNICO NOVO! ⚡',
    'QUALIDADE DE ÁUDIO E TECNOLOGIA COM PREÇO ACESSÍVEL! 📱',
  ],
  geral: [
    'OFERTA INTERESSANTE QUE VALE SUA ATENÇÃO HOJE! 🔥',
    'PREÇO DIFERENCIADO PRA VOCÊ APROVEITAR ESSA OFERTA! ✨',
    'BOA OPORTUNIDADE DE COMPRA PRA VOCÊ CONFERIR! 🛒',
    'ESSE PRODUTO APARECEU COM UM PREÇO QUE VALE A PENA! 💡',
  ],
};

let lastUsedIndex = -1;
let lastUsedCategory: ProductHookCategory = 'geral';

/**
 * Detecta a categoria do produto a partir do título do anúncio
 */
export function detectProductCategory(title: string): ProductHookCategory {
  if (!title) return 'geral';
  const clean = title.toLowerCase();

  for (const mapping of CATEGORY_MAP) {
    for (const pattern of mapping.patterns) {
      if (pattern.test(clean)) {
        return mapping.category;
      }
    }
  }

  return 'geral';
}

/**
 * Gera um gancho profissional com rotação controlada para nunca repetir
 * a mesma frase consecutiva, adaptado ao contexto do produto.
 * 
 * Regras:
 * - Apenas um gancho.
 * - Curto e direto.
 * - Relacionado ao produto.
 * - Sem termos 'achado' ou 'achadinhos'.
 */
export function generateSmartHook(title: string, options?: { discountPct?: number }): string {
  const category = detectProductCategory(title);
  const hooks = HOOK_LIBRARY[category] || HOOK_LIBRARY.geral;

  let nextIdx = 0;
  if (category === lastUsedCategory && hooks.length > 1) {
    nextIdx = (lastUsedIndex + 1) % hooks.length;
  } else {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = (hash << 5) - hash + title.charCodeAt(i);
      hash |= 0;
    }
    nextIdx = Math.abs(hash) % hooks.length;
    if (nextIdx === lastUsedIndex && hooks.length > 1) {
      nextIdx = (nextIdx + 1) % hooks.length;
    }
  }

  lastUsedIndex = nextIdx;
  lastUsedCategory = category;

  let selectedHook = hooks[nextIdx];

  // Se houver um desconto alto confirmado (>= 50%), podemos usar uma abertura especial legítima
  if (options?.discountPct && options.discountPct >= 50 && Math.random() > 0.6) {
    return `DESCONTO DE ${Math.round(options.discountPct)}% QUE REALMENTE VALE A PENA! 🔥`;
  }

  return selectedHook;
}
