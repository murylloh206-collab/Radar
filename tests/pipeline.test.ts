import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCandidateOffer,
  calculateEffectivePrice,
  generateProductFingerprint,
} from "../src/lib/server/offer-scoring-engine";
import { encryptSession, decryptSession } from "../src/lib/server/session-vault";
import { mercadoLivreProvider } from "../src/lib/server/providers/mercadolivre-provider";
import { shopeeProvider } from "../src/lib/server/providers/shopee-provider";
import { getProvider } from "../src/lib/server/providers";
import { computeQueueStats, MAX_PENDING_OFFERS } from "../src/lib/server/offers-service";
import { formatAutoDispatchMessage } from "../src/lib/whatsapp-format";
import type { NormalizedCandidateProduct } from "../src/lib/server/providers/provider-interface";
import type { Offer } from "../src/lib/types";

// Setup mock session key for encryption tests
process.env.SESSION_ENCRYPTION_KEY = "test-secret-encryption-key-with-sufficient-length-32";

test("Cálculo do Preço Efetivo com e sem cupom", () => {
  // Sem cupom
  assert.equal(calculateEffectivePrice(100), 100);

  // Cupom percentual
  assert.equal(calculateEffectivePrice(100, "PROMO10", "10% OFF"), 90);
  assert.equal(calculateEffectivePrice(200, "PROMO20", "20% OFF"), 160);

  // Cupom em reais
  assert.equal(calculateEffectivePrice(150, "CUPOM20", "R$ 20 OFF"), 130);
});

test("Filtro Obrigatório: Preço efetivo no mínimo R$ 24,99", () => {
  const baseCandidate: NormalizedCandidateProduct = {
    source: "mercadolivre",
    externalId: "MLB123456",
    title: "Fone de Ouvido Bluetooth Sem Fio Original",
    thumbnail: "https://example.com/img.jpg",
    price: 24.99, // Exatamente R$ 24,99 (deve ser aprovado)
    originalPrice: 50.00,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-123456",
    freeShipping: true,
    isInStock: true,
    rating: 4.8,
    reviewsCount: 150,
    capturedAt: new Date().toISOString(),
  };

  // Preço de R$ 24,99 deve passar
  const evalPrice2499 = evaluateCandidateOffer({ candidate: baseCandidate });
  assert.equal(evalPrice2499.passed, true, "Preço de R$ 24,99 deve ser aprovado");
  assert.equal(evalPrice2499.audit.failedFilters.length, 0);

  // Preço de R$ 24,98 deve falhar
  const evalPrice2498 = evaluateCandidateOffer({ candidate: { ...baseCandidate, price: 24.98 } });
  assert.equal(evalPrice2498.passed, false, "Preço de R$ 24,98 deve falhar");
  assert.ok(
    evalPrice2498.audit.failedFilters.some((f) => f.includes("24,99")),
    "Deve conter o motivo de preço inferior a R$ 24,99"
  );

  // Preço de R$ 15,00 deve falhar
  const evalPrice15 = evaluateCandidateOffer({ candidate: { ...baseCandidate, price: 15.00 } });
  assert.equal(evalPrice15.passed, false);

  // Preço de R$ 79,90 deve ser aprovado (com originalPrice coerente)
  const evalPrice79 = evaluateCandidateOffer({ candidate: { ...baseCandidate, price: 79.90, originalPrice: 120.00 } });
  assert.equal(evalPrice79.passed, true);
});

test("Filtros Obrigatórios: Estoque, dados mínimos e URL válida", () => {
  const candidate: NormalizedCandidateProduct = {
    source: "mercadolivre",
    externalId: "MLB9999",
    title: "Notebook Gamer RTX 4060 16GB",
    thumbnail: "https://example.com/thumb.jpg",
    price: 4500.00,
    originalPrice: 5500.00,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-9999",
    freeShipping: true,
    isInStock: false, // Esgotado
    capturedAt: new Date().toISOString(),
  };

  const evalOutOfStock = evaluateCandidateOffer({ candidate });
  assert.equal(evalOutOfStock.passed, false);
  assert.ok(evalOutOfStock.audit.failedFilters.some((f) => f.includes("esgotado") || f.includes("indisponível")));

  // Título curto/inválido
  const evalShortTitle = evaluateCandidateOffer({
    candidate: { ...candidate, isInStock: true, title: "Abc" },
  });
  assert.equal(evalShortTitle.passed, false);
  assert.ok(evalShortTitle.audit.failedFilters.some((f) => f.includes("Título")));
});

test("Cálculo e normalização do score (0 a 100) e transparência dos componentes", () => {
  const candidate: NormalizedCandidateProduct = {
    source: "mercadolivre",
    externalId: "MLB8888",
    title: "Air Fryer Fritadeira Elétrica 4L Sem Óleo",
    thumbnail: "https://example.com/airfryer.jpg",
    price: 299.90,
    originalPrice: 499.90, // Desconto de ~40%
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-8888",
    freeShipping: true,
    isInStock: true,
    rating: 4.8,
    reviewsCount: 300,
    sellerReputation: "MercadoLíder Platinum",
    coupon: "FRITADEIRA10",
    couponDescription: "10% OFF",
    shortUrl: "https://meli.la/2abcde",
    capturedAt: new Date().toISOString(),
  };

  const result = evaluateCandidateOffer({ candidate });
  assert.equal(result.passed, true);
  // Sem volume de vendas (dado indisponível na fonte): 76 pontos
  assert.equal(result.score, 76, `Score sem vendas confirmado: ${result.score}`);

  // Com volume de vendas confirmado de 200 unidades (+15 pts): 91 pontos
  const withSales = evaluateCandidateOffer({
    candidate: { ...candidate, salesVolume: 200 },
  });
  assert.equal(withSales.score, 91, `Score com vendas confirmadas: ${withSales.score}`);

  // Verifica se todos os 7 componentes foram computados de forma explicável
  assert.equal(result.audit.components.length, 7);
  const compNames = result.audit.components.map((c) => c.name);
  assert.ok(compNames.includes("Desconto Real e Preço Efetivo"));
  assert.ok(compNames.includes("Volume de Vendas e Demanda"));
  assert.ok(compNames.includes("Avaliações e Nota Média"));
  assert.ok(compNames.includes("Cupom Válido e Aplicável"));
  assert.ok(compNames.includes("Disponibilidade e Frescor"));
  assert.ok(compNames.includes("Qualidade do Link de Afiliado"));
  assert.ok(compNames.includes("Sinais Adicionais e Confiabilidade"));

  // Volume de vendas não informado na API pública deve estar explicitamente como 'indisponivel' sem invenção
  const demandComp = result.audit.components.find((c) => c.name === "Volume de Vendas e Demanda");
  assert.equal(demandComp?.dataSource, "indisponivel");
  assert.equal(demandComp?.points, 0);
});

test("Detecção de duplicidade via Fingerprint e Tombstone", () => {
  const fp1 = generateProductFingerprint("mercadolivre", "MLB123", "Smartphone Galaxy S23 128GB");
  const fp2 = generateProductFingerprint("mercadolivre", "MLB123", "Smartphone Galaxy S23 128GB");
  const fp3 = generateProductFingerprint("mercadolivre", "MLB456", "Outro Produto Qualquer");

  assert.equal(fp1, fp2, "Fingerprints do mesmo produto devem ser idênticos");
  assert.notEqual(fp1, fp3, "Fingerprints de produtos diferentes devem divergir");

  // Rejeição por Tombstone ativo
  const candidate: NormalizedCandidateProduct = {
    source: "mercadolivre",
    externalId: "MLB123",
    title: "Smartphone Galaxy S23 128GB",
    thumbnail: "https://example.com/img.jpg",
    price: 2500,
    originalPrice: 3000,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-123",
    freeShipping: true,
    isInStock: true,
    capturedAt: new Date().toISOString(),
  };

  const tombstoneResult = evaluateCandidateOffer({
    candidate,
    tombstones: [
      {
        id: "mercadolivre:MLB123",
        fingerprint: fp1,
        title: candidate.title,
        rejectedAt: new Date().toISOString(),
        reason: "Excluído definitivamente pelo usuário",
      },
    ],
  });

  assert.equal(tombstoneResult.passed, false, "Oferta em tombstone deve ser rejeitada");
  assert.ok(tombstoneResult.audit.failedFilters.some((f) => f.includes("tombstone")));
});

test("Gestão da Fila: Limite rígido de 500 ofertas pendentes", () => {
  const dummyOffer = (id: number, status: Offer["status"]): Offer => ({
    id: `mercadolivre:MLB${id}`,
    source: "mercadolivre",
    externalId: `MLB${id}`,
    title: `Produto ${id}`,
    thumbnail: null,
    price: 100,
    originalPrice: 150,
    discountPercent: 33,
    currency: "BRL",
    originalUrl: `https://produto.mercadolivre.com.br/MLB-${id}`,
    freeShipping: true,
    searchTerm: "teste",
    status,
    affiliateUrl: `https://meli.la/${id}`,
    coupon: null,
    couponDescription: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    statusChangedAt: null,
  });

  // Fila com 470 pendentes
  const offers470: Offer[] = [];
  for (let i = 1; i <= 470; i++) offers470.push(dummyOffer(i, "pendente"));
  for (let i = 471; i <= 500; i++) offers470.push(dummyOffer(i, "publicado"));

  const stats470 = computeQueueStats(offers470);
  assert.equal(stats470.pendingCount, 470);
  assert.equal(stats470.maxPending, MAX_PENDING_OFFERS);
  assert.equal(stats470.availableSlots, 30);
  assert.equal(stats470.isQueueFull, false);

  // Fila cheia com 500 pendentes
  const offers500: Offer[] = [];
  for (let i = 1; i <= 500; i++) offers500.push(dummyOffer(i, "pendente"));

  const stats500 = computeQueueStats(offers500);
  assert.equal(stats500.pendingCount, 500);
  assert.equal(stats500.availableSlots, 0);
  assert.equal(stats500.isQueueFull, true);
});

test("Cofre de Sessão: Criptografia AES-256-GCM server-side", () => {
  const secretCookie = "c_user=12345; xs=token_ultra_secreto_ml_cookie; _csrf=xyz987";
  const encrypted = encryptSession(secretCookie);

  assert.ok(encrypted.ciphertext, "Deve conter texto cifrado");
  assert.ok(encrypted.iv, "Deve conter IV");
  assert.ok(encrypted.authTag, "Deve conter AuthTag do GCM");
  assert.notEqual(encrypted.ciphertext, secretCookie, "Texto cifrado não pode expor cookie bruto");

  const decrypted = decryptSession(encrypted);
  assert.equal(decrypted, secretCookie, "Deve decriptografar perfeitamente o valor original");
});

test("Arquitetura e Isolamento de Provedores: Mercado Livre vs Shopee", () => {
  const ml = getProvider("mercadolivre");
  assert.equal(ml.source, "mercadolivre");
  assert.equal(ml.capabilities.supportsOfficialApi, true);
  assert.equal(ml.capabilities.supportsOfficialAffiliateShortening, true);

  const shopee = getProvider("shopee");
  assert.equal(shopee.source, "shopee");
  assert.equal(shopee.capabilities.supportsOfficialApi, true, "Shopee possui suporte à API Oficial de Afiliados (GraphQL)");
  assert.equal(shopee.capabilities.supportsOfficialAffiliateShortening, true, "Shopee gera links oficiais de afiliados encurtados");
  assert.equal(typeof shopee.isConfigured(), "boolean");
});

test("Preservação integral do formatador e fluxo de WhatsApp", () => {
  const offer: Offer = {
    id: "mercadolivre:MLB555",
    source: "mercadolivre",
    externalId: "MLB555",
    title: "Monitor Gamer 144Hz 24 Polegadas IPS",
    thumbnail: "https://example.com/monitor.jpg",
    price: 899.90,
    originalPrice: 1299.90,
    discountPercent: 30,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-555",
    freeShipping: true,
    searchTerm: "monitor",
    status: "aprovado",
    affiliateUrl: "https://mercadolivre.com.br/afiliados/tag",
    shortUrl: "https://meli.la/monitor144",
    coupon: "GAMER50",
    couponDescription: "R$ 50 OFF",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    statusChangedAt: null,
  };

  const message = formatAutoDispatchMessage(offer);
  assert.ok(message.includes("Monitor Gamer 144Hz"), "Mensagem deve conter o título");
  assert.ok(message.includes("https://meli.la/monitor144"), "Mensagem deve priorizar o link curto meli.la");
  assert.ok(message.includes("GAMER50"), "Mensagem deve conter o cupom");
  assert.ok(message.includes("899,90"), "Mensagem deve conter o preço formatado");
});
