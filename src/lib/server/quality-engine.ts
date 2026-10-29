import { OfferEvaluation, ProductItem, QualityRule } from '../types';

export interface EvaluateProductInput {
  product: Partial<ProductItem>;
  rule: QualityRule;
  rawText?: string;
}

export function evaluateOfferQuality(input: EvaluateProductInput): OfferEvaluation {
  const { product, rule, rawText = '' } = input;
  const failures: string[] = [];
  const criteriaBreakdown: OfferEvaluation['criteriaBreakdown'] = [];

  let totalScore = 0;
  let maxPossibleScore = 0;

  // 1. Verificação de Palavras Bloqueadas
  const lowerText = `${product.title || ''} ${rawText}`.toLowerCase();
  const matchedBlockedWords = (rule.blockedKeywords || []).filter((kw) =>
    lowerText.includes(kw.toLowerCase())
  );

  if (matchedBlockedWords.length > 0) {
    failures.push(`Contém termos bloqueados: ${matchedBlockedWords.join(', ')}`);
  }

  // 2. Prova Social: Avaliações e Rating
  const rating = product.rating || 0;
  const reviewsCount = product.reviewsCount || 0;
  const minRating = typeof rule.minRating === 'number' ? rule.minRating : 4.5;
  const minReviews = typeof rule.minReviewsCount === 'number' ? rule.minReviewsCount : 10;

  let ratingPassed = false;
  if (reviewsCount >= minReviews && rating >= minRating) {
    ratingPassed = true;
    totalScore += 30;
    criteriaBreakdown.push({
      name: 'Avaliações e Nota',
      score: 30,
      weight: 30,
      passed: true,
      detail: `Nota ${rating.toFixed(1)} com ${reviewsCount} avaliações (mínimo: ${minRating.toFixed(1)} e ${minReviews} avaliações)`,
    });
  } else {
    const isZeroReviews = reviewsCount === 0;
    if (rule.requireSocialProof && isZeroReviews) {
      failures.push('Produto sem prova social (0 avaliações registradas)');
    } else if (rating < minRating) {
      failures.push(`Nota ${rating.toFixed(1)} abaixo do mínimo exigido de ${minRating.toFixed(1)}`);
    } else if (reviewsCount < minReviews) {
      failures.push(`Apenas ${reviewsCount} avaliações (mínimo exigido: ${minReviews})`);
    }

    criteriaBreakdown.push({
      name: 'Avaliações e Nota',
      score: 0,
      weight: 30,
      passed: false,
      detail: `Nota ${rating.toFixed(1)} (${reviewsCount} avaliações) — não atingiu ${minRating.toFixed(1)} com ${minReviews} avaliações`,
    });
  }
  maxPossibleScore += 30;

  // 3. Volume de Vendas
  const salesCount = product.salesCount || 0;
  const minSales = typeof rule.minSalesCount === 'number' ? rule.minSalesCount : 5;
  let salesPassed = false;

  if (salesCount >= minSales) {
    salesPassed = true;
    totalScore += 25;
    criteriaBreakdown.push({
      name: 'Volume de Vendas',
      score: 25,
      weight: 25,
      passed: true,
      detail: `${salesCount} vendas confirmadas (mínimo: ${minSales})`,
    });
  } else {
    if (rule.requireSocialProof && salesCount === 0 && !ratingPassed) {
      failures.push('Nenhuma venda ou avaliação confirmada no marketplace');
    } else if (salesCount < minSales) {
      failures.push(`Vendas registradas (${salesCount}) abaixo do mínimo configurado (${minSales})`);
    }

    criteriaBreakdown.push({
      name: 'Volume de Vendas',
      score: 0,
      weight: 25,
      passed: false,
      detail: `${salesCount} vendas registradas (mínimo exigido: ${minSales})`,
    });
  }
  maxPossibleScore += 25;

  // 4. Desconto Real / Verificável
  const discountPct = product.discountPct || 0;
  const minDiscount = typeof rule.minDiscountPct === 'number' ? rule.minDiscountPct : 10;

  if (discountPct >= minDiscount) {
    totalScore += 25;
    criteriaBreakdown.push({
      name: 'Desconto Verificável',
      score: 25,
      weight: 25,
      passed: true,
      detail: `${discountPct.toFixed(0)}% de desconto (mínimo: ${minDiscount.toFixed(0)}%)`,
    });
  } else {
    if (minDiscount > 0 && discountPct < minDiscount) {
      failures.push(`Desconto de ${discountPct.toFixed(0)}% é inferior ao mínimo (${minDiscount.toFixed(0)}%)`);
    }
    criteriaBreakdown.push({
      name: 'Desconto Verificável',
      score: 0,
      weight: 25,
      passed: false,
      detail: `${discountPct.toFixed(0)}% de desconto (mínimo exigido: ${minDiscount.toFixed(0)}%)`,
    });
  }
  maxPossibleScore += 25;

  // 5. Disponibilidade e Estoque
  const inStock = product.inStock !== false;
  if (rule.requireInStock && !inStock) {
    failures.push('Produto esgotado ou indisponível');
    criteriaBreakdown.push({
      name: 'Disponibilidade',
      score: 0,
      weight: 20,
      passed: false,
      detail: 'Produto sem estoque imediato',
    });
  } else {
    totalScore += 20;
    criteriaBreakdown.push({
      name: 'Disponibilidade',
      score: 20,
      weight: 20,
      passed: true,
      detail: 'Produto com estoque ativo e disponível para compra',
    });
  }
  maxPossibleScore += 20;

  const normalizedScore = Math.round((totalScore / maxPossibleScore) * 100);

  // Decisão final
  let decision: OfferEvaluation['decision'] = 'aprovado';
  let reason = 'Oferta cumpre todos os critérios de qualidade e reputação.';

  if (failures.length > 0) {
    decision = 'rejeitado';
    reason = `Reprovado pelos seguintes motivos: ${failures.join('; ')}.`;
  } else if (normalizedScore < 60) {
    decision = 'pendente';
    reason = `Pontuação ${normalizedScore}/100 abaixo do limiar automático (60/100). Requer análise manual.`;
  }

  return {
    id: `eval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: product.userId || 'system',
    productId: product.id,
    score: normalizedScore,
    decision,
    reason,
    criteriaBreakdown,
    evidences: {
      rating,
      reviewsCount,
      salesCount,
      discountPct,
      currentPrice: product.currentPrice,
      originalPrice: product.originalPrice,
    },
    failures,
    evaluatedAt: new Date().toISOString(),
  };
}
