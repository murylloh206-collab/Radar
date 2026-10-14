import "server-only";

import crypto from "node:crypto";
import { validateAffiliateUrl } from "../offer-rules";
import type {
  AlgorithmSettings,
  FieldDataSource,
  Offer,
  PriceHistoryItem,
  ScoreAudit,
  ScoreComponentBreakdown,
  TombstoneRecord,
} from "../types";
import type { NormalizedCandidateProduct } from "./providers/provider-interface";
import { DEFAULT_ALGORITHM_SETTINGS } from "./scoring-rules";

export interface EvaluationInput {
  candidate: NormalizedCandidateProduct;
  history?: PriceHistoryItem[];
  existingOffers?: Offer[];
  tombstones?: TombstoneRecord[];
  settings?: AlgorithmSettings;
}

export interface EvaluationResult {
  passed: boolean;
  score: number;
  audit: ScoreAudit;
  effectivePrice: number;
  fingerprint: string;
}

export const BLOCKED_KEYWORDS = [
  "livro",
  "livros",
  "ebook",
  "e-book",
  "receita",
  "receitas",
  "curso",
  "cursos",
  "infoproduto",
  "infoprodutos",
  "produto digital",
  "produtos digitais",
  "digital download",
  "download imediato",
  "apostila",
  "audiobook",
  "audio book",
  "arquivo pdf",
  "pdf",
  "planilha digital",
  "licenca digital",
  "licença digital",
  "software digital",
  "videoaula",
  "treinamento online",
  "mentoria",
  "mentorias",
  "planilha",
  "planilhas",
  "drive",
];

export const BLOCKED_CATEGORY_IDS = [
  "MLB1196", // Livros, Revistas e Comics
  "MLB1144", // Livros
  "MLB271599", // Cursos
  "MLB1367", // Antiguidades e Coleções não prioritárias
];

/**
 * Verifica se um produto ou categoria deve ser bloqueado por padrão.
 * Utiliza categoria oficial do Mercado Livre quando disponível e regras transparentes de título.
 */
export function isBlockedProductOrCategory(
  title: string,
  categoryId?: string | null,
  searchTerm?: string | null
): { blocked: boolean; reason?: string } {
  if (categoryId && BLOCKED_CATEGORY_IDS.includes(categoryId)) {
    return {
      blocked: true,
      reason: `Categoria oficial bloqueada (${categoryId}): livros, revistas e cursos não são permitidos no Radar.`,
    };
  }

  const normalizedTitle = (title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normalizedSearch = (searchTerm || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const text = ` ${normalizedTitle} ${normalizedSearch} `;

  for (const kw of BLOCKED_KEYWORDS) {
    const cleanKw = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (
      text.includes(` ${cleanKw} `) ||
      text.includes(` ${cleanKw}`) ||
      text.includes(`${cleanKw} `) ||
      normalizedTitle.includes(cleanKw)
    ) {
      return {
        blocked: true,
        reason: `Categoria bloqueada: livros, receitas, cursos e infoprodutos são proibidos (termo: "${kw}").`,
      };
    }
  }

  return { blocked: false };
}

/**
 * Gera uma impressão digital consistente (fingerprint) do produto
 * para detecção de duplicidades e tombstones independente de pequenas variações de URL.
 */
export function generateProductFingerprint(
  source: string,
  externalId: string,
  title: string
): string {
  const normalizedTitle = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 80);

  const raw = `${source.toLowerCase()}:${externalId.toLowerCase()}:${normalizedTitle}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

/**
 * Calcula o preço efetivo final considerando descontos e cupons aplicáveis
 */
export function calculateEffectivePrice(
  price: number,
  coupon?: string | null,
  couponDescription?: string | null
): number {
  let effective = price;

  if (coupon && couponDescription) {
    const desc = couponDescription.toLowerCase();
    // Ex: "10% OFF" ou "R$ 20 OFF"
    const pctMatch = desc.match(/(\d+)\s*%\s*off/);
    if (pctMatch?.[1]) {
      const pct = Number.parseInt(pctMatch[1], 10);
      if (pct > 0 && pct <= 50) {
        effective = effective * (1 - pct / 100);
      }
    } else {
      const valMatch = desc.match(/r\$\s*(\d+(?:[.,]\d{2})?)/);
      if (valMatch?.[1]) {
        const val = Number.parseFloat(valMatch[1].replace(",", "."));
        if (val > 0 && val < effective) {
          effective = effective - val;
        }
      }
    }
  }

  return Math.round(effective * 100) / 100;
}

/**
 * MOTOR DE QUALIDADE DE OFERTAS (0–100) COM FILTROS ELIMINATÓRIOS E AUDITORIA COMPLETA
 */
export function evaluateCandidateOffer(input: EvaluationInput): EvaluationResult {
  const { candidate, history = [], existingOffers = [], tombstones = [], settings = DEFAULT_ALGORITHM_SETTINGS } = input;
  const components: ScoreComponentBreakdown[] = [];
  const penalties: string[] = [];
  const failedFilters: string[] = [];

  const fingerprint = generateProductFingerprint(candidate.source, candidate.externalId, candidate.title);
  const effectivePrice = calculateEffectivePrice(candidate.price, candidate.coupon, candidate.couponDescription);

  // =========================================================================
  // 1. FILTROS ELIMINATÓRIOS OBRIGATÓRIOS (CORTE IMEDIATO)
  // =========================================================================

  const minPrice = settings.minEffectivePrice ?? 24.99;
  // Filtro 1: Preço efetivo no mínimo R$ 24,99
  if (effectivePrice < minPrice) {
    failedFilters.push(
      `Preço efetivo de R$ ${effectivePrice.toFixed(2).replace(".", ",")} é inferior ao valor mínimo permitido de R$ ${minPrice.toFixed(2).replace(".", ",")}.`
    );
  }

  // Filtro 2: Disponibilidade e estoque
  if (!candidate.isInStock || candidate.availableStock === 0) {
    failedFilters.push("Produto esgotado, pausado ou indisponível para compra imediata.");
  }

  // Filtro 3: Dados mínimos confiáveis
  if (!candidate.title || candidate.title.trim().length < 5) {
    failedFilters.push("Título do produto ausente ou inconsistente.");
  }
  if (!candidate.originalUrl || !candidate.originalUrl.startsWith("http")) {
    failedFilters.push("URL original do produto ausente ou inválida.");
  }

  // Filtro 4: Validação de URL de afiliado
  const linkToCheck = candidate.shortUrl || candidate.affiliateUrl || candidate.originalUrl;
  const linkValidation = validateAffiliateUrl(linkToCheck, candidate.originalUrl);
  if (candidate.affiliateUrl && !linkValidation.ok) {
    failedFilters.push(`URL de afiliado inválida para o provedor: ${linkValidation.error}`);
  }

  // Filtro 5: Verificação de Tombstone (oferta excluída definitivamente anteriormente)
  const isTombstone = tombstones.some(
    (t) => t.fingerprint === fingerprint || t.id === `${candidate.source}:${candidate.externalId}`
  );
  if (isTombstone) {
    failedFilters.push("Oferta previamente excluída em Rejeitados (tombstone ativo retido na janela de deduplicação).");
  }

  // Filtro 6: Frescor da informação (não pode ser capturado há mais de 7 dias)
  const captureTime = new Date(candidate.capturedAt || Date.now()).getTime();
  const ageHours = (Date.now() - captureTime) / (1000 * 60 * 60);
  if (ageHours > 168) {
    failedFilters.push(`Oferta desatualizada (capturada há ${Math.round(ageHours)} horas).`);
  }

  // Filtro 7: Desconto real (se tem preço 'de', não pode ser menor que o preço atual)
  if (candidate.originalPrice !== null && candidate.originalPrice <= candidate.price) {
    failedFilters.push("Inconsistência de desconto: preço original inferior ou igual ao preço promocional.");
  }

  // Filtro 8: Bloqueio estrito de livros, receitas, cursos e produtos digitais
  const categoryCheck = isBlockedProductOrCategory(candidate.title, candidate.categoryId, candidate.categoryName);
  if (categoryCheck.blocked) {
    failedFilters.push(categoryCheck.reason || "Categoria bloqueada: livros, receitas, cursos e infoprodutos são proibidos.");
  }

  // =========================================================================
  // 2. COMPONENTES DO SCORE 0–100 (TRANSPARENTE E AUDITÁVEL)
  // =========================================================================
  let totalScore = 0;
  const weights = settings.weights;

  // Componente 1: Desconto Real e Preço Efetivo (Máx 25 pts)
  {
    const maxPts = weights.realDiscountAndPrice;
    let pts = 0;
    let source: FieldDataSource = "indisponivel";
    let detail = "Sem preço original de referência comprovado";

    if (candidate.originalPrice && candidate.originalPrice > candidate.price) {
      source = "confirmado";
      const discount = Math.round((1 - candidate.price / candidate.originalPrice) * 100);
      if (discount >= 50) pts = maxPts;
      else if (discount >= 40) pts = Math.round(maxPts * 0.85);
      else if (discount >= 30) pts = Math.round(maxPts * 0.70);
      else if (discount >= 20) pts = Math.round(maxPts * 0.50);
      else if (discount >= 10) pts = Math.round(maxPts * 0.35);
      else pts = Math.round(maxPts * 0.20);

      detail = `${discount}% OFF real comparado ao preço anterior`;
    }

    // Bônus se comprovadamente for o menor preço do histórico registrado
    if (history.length >= 2) {
      const historicalMin = Math.min(...history.map((h) => h.price).filter((p) => p > 0));
      if (candidate.price <= historicalMin) {
        pts = Math.min(maxPts, pts + 3);
        detail += " (Menor preço histórico registrado)";
      }
    }

    components.push({
      name: "Desconto Real e Preço Efetivo",
      points: pts,
      maxPoints: maxPts,
      dataSource: source,
      detail,
    });
    totalScore += pts;
  }

  // Componente 2: Volume de Vendas e Evidência de Demanda (Máx 20 pts)
  {
    const maxPts = weights.salesVolumeAndDemand;
    let pts = 0;
    let source: FieldDataSource = "indisponivel";
    let detail = "Dado não exposto pela API pública da plataforma de origem";

    if (typeof candidate.salesVolume === "number" && candidate.salesVolume > 0) {
      source = "confirmado";
      const vol = candidate.salesVolume;
      if (vol >= 500) pts = maxPts;
      else if (vol >= 100) pts = Math.round(maxPts * 0.75);
      else if (vol >= 25) pts = Math.round(maxPts * 0.50);
      else pts = Math.round(maxPts * 0.25);
      detail = `${vol} unidades vendidas confirmadas`;
    }

    components.push({
      name: "Volume de Vendas e Demanda",
      points: pts,
      maxPoints: maxPts,
      dataSource: source,
      detail,
    });
    totalScore += pts;
  }

  // Componente 3: Avaliações e Nota Média (Máx 15 pts)
  {
    const maxPts = weights.reviewsAndRating;
    let pts = 0;
    let source: FieldDataSource = "indisponivel";
    let detail = "Sem avaliações registradas";

    if (typeof candidate.rating === "number" && candidate.rating > 0) {
      source = "confirmado";
      const rating = candidate.rating;
      if (rating >= 4.7) pts = maxPts;
      else if (rating >= 4.4) pts = Math.round(maxPts * 0.80);
      else if (rating >= 4.0) pts = Math.round(maxPts * 0.55);
      else if (rating >= 3.5) pts = Math.round(maxPts * 0.30);
      else {
        pts = 0;
        penalties.push(`Nota muito baixa (⭐ ${rating.toFixed(1)})`);
      }

      detail = `⭐ ${rating.toFixed(1)} (${candidate.reviewsCount || 0} opiniões)`;
    }

    components.push({
      name: "Avaliações e Nota Média",
      points: pts,
      maxPoints: maxPts,
      dataSource: source,
      detail,
    });
    totalScore += pts;
  }

  // Componente 4: Cupom Válido e Aplicável (Máx 10 pts)
  {
    const maxPts = weights.couponValidity;
    let pts = 0;
    let source: FieldDataSource = "nao_aplicavel";
    let detail = "Oferta sem cupom aplicável";

    if (candidate.coupon) {
      source = "confirmado";
      pts = maxPts;
      detail = `Cupom ativo: ${candidate.coupon} (${candidate.couponDescription || "Aplicável"})`;
    }

    components.push({
      name: "Cupom Válido e Aplicável",
      points: pts,
      maxPoints: maxPts,
      dataSource: source,
      detail,
    });
    totalScore += pts;
  }

  // Componente 5: Disponibilidade e Frescor (Máx 10 pts)
  {
    const maxPts = weights.availabilityAndFreshness;
    let pts = 0;
    const source: FieldDataSource = "confirmado";
    let detail = "";

    if (ageHours <= 2) {
      pts = maxPts;
      detail = "Captura recente (< 2 horas)";
    } else if (ageHours <= 12) {
      pts = Math.round(maxPts * 0.8);
      detail = `Captura recente (${Math.round(ageHours)}h atrás)`;
    } else if (ageHours <= 48) {
      pts = Math.round(maxPts * 0.5);
      detail = `Captura dentro de 48h (${Math.round(ageHours)}h atrás)`;
    } else {
      pts = Math.round(maxPts * 0.2);
      detail = `Oferta com mais de 2 dias (${Math.round(ageHours)}h atrás)`;
    }

    components.push({
      name: "Disponibilidade e Frescor",
      points: pts,
      maxPoints: maxPts,
      dataSource: source,
      detail,
    });
    totalScore += pts;
  }

  // Componente 6: Qualidade e Validade do Link de Afiliado (Máx 10 pts)
  {
    const maxPts = weights.affiliateLinkQuality;
    let pts = 0;
    let source: FieldDataSource = "indisponivel";
    let detail = "Link de afiliado pendente";

    if (candidate.shortUrl && candidate.shortUrl.includes("meli.la")) {
      pts = maxPts;
      source = "confirmado";
      detail = "Link oficial meli.la verificado";
    } else if (candidate.affiliateUrl && linkValidation.ok) {
      pts = Math.round(maxPts * 0.8);
      source = "confirmado";
      detail = "Link canônico de afiliado com tag autorizada";
    }

    components.push({
      name: "Qualidade do Link de Afiliado",
      points: pts,
      maxPoints: maxPts,
      dataSource: source,
      detail,
    });
    totalScore += pts;
  }

  // Componente 7: Sinais Adicionais e Confiabilidade (Máx 10 pts)
  {
    const maxPts = weights.additionalSignals;
    let pts = 0;
    const notes: string[] = [];

    if (candidate.freeShipping) {
      pts += 5;
      notes.push("Frete grátis");
    }

    if (candidate.sellerReputation) {
      const rep = candidate.sellerReputation.toLowerCase();
      if (rep.includes("platinum") || rep.includes("gold") || rep.includes("oficial")) {
        pts += 5;
        notes.push("Loja Oficial / MercadoLíder");
      }
    }

    const source: FieldDataSource = notes.length > 0 ? "confirmado" : "nao_aplicavel";
    const detail = notes.length > 0 ? notes.join(" · ") : "Nenhum sinal adicional aplicável";

    components.push({
      name: "Sinais Adicionais e Confiabilidade",
      points: Math.min(maxPts, pts),
      maxPoints: maxPts,
      dataSource: source,
      detail,
    });
    totalScore += Math.min(maxPts, pts);
  }

  // Aplica penalidades acumuladas
  if (penalties.length > 0) {
    totalScore = Math.max(0, totalScore - penalties.length * 10);
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(totalScore)));
  const passedMandatoryFilters = failedFilters.length === 0;

  // =========================================================================
  // 3. DECISÃO FINAL BASEADA NO MODO DE ROLLOUT E SCORE MÍNIMO (PADRÃO 75)
  // =========================================================================
  let decision: ScoreAudit["decision"] = "pendente";
  let decisionReason = "";
  const minAutoScore = settings.minAutoApproveScore ?? 75;

  if (!passedMandatoryFilters) {
    decision = "rejeitado";
    decisionReason = `Rejeitado pelos filtros eliminatórios: ${failedFilters.join("; ")}`;
  } else if (settings.rolloutMode === "publicacao_automatica" && finalScore >= minAutoScore) {
    decision = "aprovado";
    decisionReason = `Aprovado automaticamente: Score ${finalScore} >= limiar configurado de ${minAutoScore}.`;
  } else if (finalScore >= (settings.minManualReviewScore ?? 60)) {
    decision = "pendente";
    decisionReason = `Score ${finalScore}/100 abaixo do limiar automático de ${minAutoScore}. Aguarda validação manual.`;
  } else {
    decision = "revisao_manual";
    decisionReason = `Score ${finalScore}/100 insuficiente (mínimo configurado de ${minAutoScore}). Encaminhado para revisão manual.`;
  }

  const audit: ScoreAudit = {
    version: "2.0.0-pipeline",
    totalScore: finalScore,
    effectivePrice,
    passedMandatoryFilters,
    failedFilters,
    components,
    penalties,
    decision,
    decisionReason,
    evaluatedAt: new Date().toISOString(),
  };

  return {
    passed: passedMandatoryFilters,
    score: finalScore,
    audit,
    effectivePrice,
    fingerprint,
  };
}
