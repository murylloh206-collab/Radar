import "server-only";

import { readDatabase } from "./storage";
import { runOffersScanner, type ScannerPipelineResult } from "./scanner";
import type { LastSearchInfo, Offer } from "../types";

export interface RadarCategoryConfig {
  id: string;
  name: string;
  priority: "alta" | "media" | "menor";
  isSneaker?: boolean;
  queries: string[];
}

export const RADAR_CATEGORIES: RadarCategoryConfig[] = [
  // 1. Eletrodomésticos
  {
    id: "eletrodomesticos",
    name: "Eletrodomésticos",
    priority: "alta",
    queries: [
      "air fryer mondial",
      "air fryer philco",
      "cafeteira tres coracoes",
      "liquidificador arno",
      "air fryer",
      "cafeteira eletrica",
      "liquidificador potente",
    ],
  },
  // 2. Suplementos
  {
    id: "suplementos",
    name: "Suplementos",
    priority: "media",
    queries: [
      "creatina max titanium",
      "whey max titanium",
      "creatina integralmedica",
      "whey dux",
      "creatina 300g",
      "whey protein concentrado",
    ],
  },
  // 3. Perfumes e Beleza
  {
    id: "beleza-cuidados",
    name: "Beleza e Cuidados Pessoais",
    priority: "media",
    queries: [
      "perfume malbec",
      "perfume kaiak",
      "perfume egeo",
      "protetor solar nivea",
      "perfume masculino importado",
      "protetor solar facial",
    ],
  },
  // 4. Eletrônicos e Games
  {
    id: "eletronicos-games",
    name: "Eletrônicos e Games",
    priority: "menor",
    queries: [
      "smartwatch haylou",
      "smartwatch amazfit",
      "fone jbl",
      "controle 8bitdo",
      "fone bluetooth sem fio",
    ],
  },
  // 5. Tênis de Marca
  {
    id: "tenis-marcas",
    name: "Tênis de Marca",
    priority: "alta",
    isSneaker: true,
    queries: [
      "tenis olympikus",
      "tenis fila",
      "tenis puma",
      "tenis asics",
      "tenis nike corrida",
      "tenis adidas running",
    ],
  },
  // 6. Roupas e Moda Fitness
  {
    id: "moda-fitness-casual",
    name: "Roupas e Moda Fitness",
    priority: "alta",
    queries: [
      "cueca reebok",
      "camiseta adidas",
      "bermuda nike",
      "legging fitness",
      "camiseta academia masculina",
      "bermuda treino masculina",
    ],
  },
];

/**
 * Detecta réplicas ou falsificações em produtos e tênis
 */
export function isReplicaOrKnockoff(title: string): boolean {
  const normalized = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const patterns = [
    /\br[eé]plica\b/i,
    /\binspirad[oa]s?\b/i,
    /\bsimilar\b/i,
    /\bcompat[ií]vel\b/i,
    /\bprimeira linha\b/i,
    /\b1[aª] linha\b/i,
    /\blinha premium\b/i,
    /\bimitac[aã]o\b/i,
  ];

  return patterns.some((p) => p.test(normalized));
}

/**
 * Ordena ofertas com base nas regras de priorização:
 * 1. Nota >= 4.4 com >= 30 avaliações (ou > R$300 com >= 4.5 e >= 10 avaliações)
 * 2. Frete grátis
 * 3. Maior desconto percentual
 * 4. Mais recente
 */
export function sortPrioritizedOffers(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => {
    const isTopA =
      (typeof a.rating === "number" && a.rating >= 4.4 && typeof a.reviewsCount === "number" && a.reviewsCount >= 30) ||
      (a.price > 300 && typeof a.rating === "number" && a.rating >= 4.5 && typeof a.reviewsCount === "number" && a.reviewsCount >= 10);

    const isTopB =
      (typeof b.rating === "number" && b.rating >= 4.4 && typeof b.reviewsCount === "number" && b.reviewsCount >= 30) ||
      (b.price > 300 && typeof b.rating === "number" && b.rating >= 4.5 && typeof b.reviewsCount === "number" && b.reviewsCount >= 10);

    if (isTopA !== isTopB) return isTopA ? -1 : 1;
    if (Boolean(a.freeShipping) !== Boolean(b.freeShipping)) return a.freeShipping ? -1 : 1;
    if ((a.discountPercent ?? 0) !== (b.discountPercent ?? 0)) return (b.discountPercent ?? 0) - (a.discountPercent ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export interface PipelineStageCounts {
  etapa1_itens_retornados_api: number;
  etapa2_apos_preco_minimo_25: number;
  etapa3_apos_bloqueio_replicas: number;
  etapa4_apos_filtros_avaliacao: number;
  etapa5_gravados_atualizados_banco: number;
  etapa6_retornados_frontend: number;
}

export interface RadarDiagnostics {
  found: number;
  added: number;
  updated: number;
  skippedNoBuyBox: number;
  skippedBlocked: number;
  skippedReplica: number;
  skippedPrice: number;
  errors: string[];
}

export interface RadarUpdateResult {
  ok: boolean;
  offers: Offer[];
  lastSearch: LastSearchInfo;
  added: number;
  updated: number;
  found: number;
  skippedNoBuyBox: number;
  skippedBlocked: number;
  skippedReplica: number;
  skippedPrice: number;
  errors: string[];
  stageCounts: PipelineStageCounts;
}

let isUpdatingInProgress = false;

/**
 * Executa a atualização completa do Radar de Ofertas delegando para o
 * novo motor modular de escaneamento e validação em camadas.
 */
export async function runRadarUpdate(): Promise<RadarUpdateResult> {
  if (isUpdatingInProgress) {
    console.log("[offers-updater] Atualização já em andamento. Retornando dados atuais.");
    const currentDb = await readDatabase();
    const fallbackStageCounts: PipelineStageCounts = {
      etapa1_itens_retornados_api: 0,
      etapa2_apos_preco_minimo_25: 0,
      etapa3_apos_bloqueio_replicas: 0,
      etapa4_apos_filtros_avaliacao: 0,
      etapa5_gravados_atualizados_banco: 0,
      etapa6_retornados_frontend: currentDb.offers.length,
    };
    return {
      ok: true,
      offers: sortPrioritizedOffers(currentDb.offers),
      lastSearch: currentDb.lastSearch || {
        at: new Date().toISOString(),
        terms: [],
        found: 0,
        added: 0,
        updated: 0,
      },
      added: 0,
      updated: 0,
      found: 0,
      skippedNoBuyBox: 0,
      skippedBlocked: 0,
      skippedReplica: 0,
      skippedPrice: 0,
      errors: [],
      stageCounts: fallbackStageCounts,
    };
  }

  isUpdatingInProgress = true;

  try {
    const scannerResult = await runOffersScanner();

    const stageCounts: PipelineStageCounts = {
      etapa1_itens_retornados_api: scannerResult.stageCounts.etapa1_itens_retornados_api,
      etapa2_apos_preco_minimo_25: scannerResult.stageCounts.etapa2_apos_preco_minimo_80,
      etapa3_apos_bloqueio_replicas: scannerResult.stageCounts.etapa3_apos_blacklist_e_replicas,
      etapa4_apos_filtros_avaliacao: scannerResult.stageCounts.etapa4_apos_desconto_real_15,
      etapa5_gravados_atualizados_banco: scannerResult.stageCounts.etapa5_gravados_atualizados_banco,
      etapa6_retornados_frontend: scannerResult.stageCounts.etapa6_retornados_frontend,
    };

    return {
      ok: true,
      offers: scannerResult.offers,
      lastSearch: scannerResult.lastSearch,
      added: scannerResult.added,
      updated: scannerResult.updated,
      found: scannerResult.found,
      skippedNoBuyBox: 0,
      skippedBlocked: scannerResult.rejected.blacklistTerm,
      skippedReplica: 0,
      skippedPrice: scannerResult.rejected.minPrice,
      errors: [],
      stageCounts,
    };
  } finally {
    isUpdatingInProgress = false;
  }
}

/** Alias para compatibilidade com chamadores antigos */
export const updateOffersFromMercadoLivre = runRadarUpdate;
