/**
 * Gerador inteligente de aberturas e ganchos para o Radar de Ofertas (Puro / Browser-Safe).
 *
 * Filosofia de comunicação (alinhada às diretrizes de qualidade do Radar de Ofertas):
 * - 75% mensagens diretas e profissionais (MODELO A): foco no produto e na oportunidade ("OFERTA ESPECIAL EM [CATEGORIA]!").
 * - 25% mensagens com gancho comercial seletivo (MODELO B): reservado para produtos de grande destaque ou alto desconto (>= 20-30%).
 * - Exatamente 1 único gancho por mensagem (nunca ganchos duplicados).
 * - Termos proibidos eliminados 100%: "achado", "achados", "achadinho", "achadinhos", "apenas".
 * - Sem piadas forçadas ou promessas de escassez artificial.
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
      /cal[cç]ado/i,
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
      /lattafa/i,
      /azzaro/i,
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
      /wap/i,
      /black tools/i,
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
      /tv\s+\d+/i,
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
      /jeans/i,
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
      /compressor.*carro/i,
      /snow foam/i,
      /lavadora.*carro/i,
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

const MODEL_A_DIRECT_HEADLINES: Record<ProductHookCategory, string[]> = {
  caixa_de_som: [
    'OFERTA ESPECIAL EM CAIXA DE SOM! 🔊',
    'OFERTA ESPECIAL EM ÁUDIO! 🔊',
    'DESTAQUE EM CAIXA DE SOM! 🎶',
  ],
  suplementos: [
    'OFERTA ESPECIAL EM SUPLEMENTOS! 💪',
    'DESTAQUE EM SUPLEMENTOS! 🏋️',
    'OPORTUNIDADE EM SUPLEMENTAÇÃO! 💪',
  ],
  tenis: [
    'OFERTA ESPECIAL EM TÊNIS! 👟',
    'OFERTA ESPECIAL EM CALÇADOS! 👟',
    'DESTAQUE EM TÊNIS! 👟',
  ],
  smartphones: [
    'OFERTA ESPECIAL EM SMARTPHONES! 📱',
    'DESTAQUE EM CELULARES! 📱',
    'OPORTUNIDADE EM SMARTPHONES! 📲',
  ],
  games: [
    'OFERTA ESPECIAL EM GAMES! 🎮',
    'DESTAQUE GAMER DO DIA! 🕹️',
  ],
  relogios: [
    'OFERTA ESPECIAL EM RELÓGIOS! ⌚',
    'DESTAQUE EM SMARTWATCHES! ⌚',
  ],
  perfumes: [
    'OFERTA ESPECIAL EM PERFUMES! ✨',
    'DESTAQUE EM PERFUMARIA! 💎',
    'OPORTUNIDADE EM FRAGRÂNCIAS! ✨',
  ],
  ferramentas: [
    'OFERTA ESPECIAL EM FERRAMENTAS! 🛠️',
    'DESTAQUE EM FERRAMENTAS! 🔧',
  ],
  eletrodomesticos: [
    'OFERTA ESPECIAL EM ELETRODOMÉSTICOS! 🏠',
    'DESTAQUE EM ELETROPORTÁTEIS! 💡',
  ],
  roupas: [
    'OFERTA ESPECIAL EM MODA! 👕',
    'DESTAQUE EM VESTUÁRIO! 👔',
  ],
  automotivo: [
    'OFERTA ESPECIAL EM AUTOMOTIVO! 🚗',
    'DESTAQUE PARA SEU VEÍCULO! 🔧',
  ],
  beleza: [
    'OFERTA ESPECIAL EM CUIDADOS PESSOAIS! 🧴',
    'DESTAQUE EM BELEZA! ✨',
  ],
  eletronicos: [
    'OFERTA ESPECIAL EM ELETRÔNICOS! ⚡',
    'DESTAQUE EM TECNOLOGIA! 🎧',
  ],
  geral: [
    'OFERTA ESPECIAL DO DIA! 🎯',
    'DESTAQUE SELECIONADO! 🎯',
    'OPORTUNIDADE DO DIA! ⚡',
  ],
};

const MODEL_B_CREATIVE_HOOKS: Record<ProductHookCategory, string[]> = {
  caixa_de_som: [
    'Potência e qualidade de som com excelente desconto! 🔊',
    'Ótima oportunidade para quem busca som de alta qualidade! 🎶',
    'Caixa de som com condição diferenciada hoje! 🔥',
  ],
  suplementos: [
    'Excelente oportunidade para seu estoque de treino! 💪',
    'Preço diferenciado para quem não abre mão da suplementação! 🏋️',
    'Ótimo custo-benefício para completar sua rotina de treinos! 💪',
  ],
  tenis: [
    'Conforto e qualidade com preço reduzido hoje! 👟',
    'Excelente oportunidade para renovar o calçado! 🏃',
    'Modelo de destaque com ótimo desconto promocional! 👟',
  ],
  smartphones: [
    'Tecnologia de ponta com condição especial de compra! 📱',
    'Boa oportunidade para quem busca atualizar o smartphone! 📲',
    'Preço diferenciado para este aparelho hoje! 🚀',
  ],
  games: [
    'Excelente oportunidade para completar seu setup gamer! 🎮',
    'Item de destaque com valor diferenciado hoje! 🕹️',
  ],
  relogios: [
    'Estilo e funcionalidade com ótimo desconto! ⌚',
    'Modelo diferenciado com preço especial hoje! ✨',
  ],
  perfumes: [
    'Fragrância marcante com preço reduzido hoje! ✨',
    'Excelente oportunidade para garantir sua fragrância preferida! 💎',
    'Perfumaria com desconto especial para conferir! 🌟',
  ],
  ferramentas: [
    'Equipamento de qualidade com preço bem reduzido! 🛠️',
    'Excelente custo-benefício para sua oficina ou casa! 🔧',
  ],
  eletrodomesticos: [
    'Praticidade para sua casa com excelente economia! 🏠',
    'Item de destaque com desconto que vale a pena! 💡',
  ],
  roupas: [
    'Peça de qualidade com ótimo desconto promocional! 👕',
    'Conforto e estilo com valor muito acessível hoje! ✨',
  ],
  automotivo: [
    'Cuidado e manutenção do veículo pagando menos hoje! 🚗',
    'Item automotivo essencial com condição especial! 🔧',
  ],
  beleza: [
    'Cuidados pessoais diários com ótimo desconto! 💅',
    'Produto de qualidade com excelente custo-benefício! 🧴',
  ],
  eletronicos: [
    'Tecnologia prática para sua rotina com preço reduzido! 🎧',
    'Excelente oportunidade em eletrônicos hoje! ⚡',
  ],
  geral: [
    'Preço diferenciado nesta oportunidade selecionada! 💡',
    'Excelente condição de compra para você conferir! 🛒',
    'Produto com desconto especial que vale a pena hoje! 🔥',
  ],
};

let lastUsedCategory: ProductHookCategory = 'geral';
let lastUsedIndex = -1;

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

export function generateSmartHook(
  title: string,
  options?: { discountPct?: number; forceModel?: 'A' | 'B' }
): string {
  const category = detectProductCategory(title);

  let hash = 0;
  for (let i = 0; i < (title || '').length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash);

  const hasSubstantialDiscount = typeof options?.discountPct === 'number' && options.discountPct >= 30;
  const isEligibleForModelB = (positiveHash % 100) < 25 || (hasSubstantialDiscount && (positiveHash % 100) < 40);

  const useModelB = options?.forceModel === 'B' || (options?.forceModel !== 'A' && isEligibleForModelB);

  const bank = useModelB
    ? (MODEL_B_CREATIVE_HOOKS[category] || MODEL_B_CREATIVE_HOOKS.geral)
    : (MODEL_A_DIRECT_HEADLINES[category] || MODEL_A_DIRECT_HEADLINES.geral);

  let nextIdx = positiveHash % bank.length;
  if (category === lastUsedCategory && bank.length > 1 && nextIdx === lastUsedIndex) {
    nextIdx = (nextIdx + 1) % bank.length;
  }

  lastUsedCategory = category;
  lastUsedIndex = nextIdx;

  let chosen = bank[nextIdx];

  chosen = chosen
    .replace(/\b(achadinhos?|achados?)\b/gi, 'ofertas')
    .replace(/\bapenas\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return chosen;
}

