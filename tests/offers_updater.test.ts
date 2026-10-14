import test from "node:test";
import assert from "node:assert/strict";
import {
  isReplicaOrKnockoff,
  RADAR_CATEGORIES,
  sortPrioritizedOffers,
} from "../src/lib/server/offers-updater";
import type { Offer } from "../src/lib/types";

test("Filtro de réplica e pirataria para tênis de marca", () => {
  assert.equal(isReplicaOrKnockoff("Tênis Nike Air Max Réplica Perfeita"), true);
  assert.equal(isReplicaOrKnockoff("Tênis Adidas Yeezy replica primeira linha"), true);
  assert.equal(isReplicaOrKnockoff("Tênis New Balance 550 Inspirado"), true);
  assert.equal(isReplicaOrKnockoff("Tênis similar ao Puma Suede"), true);
  assert.equal(isReplicaOrKnockoff("Tênis compatível com corrida Nike"), true);
  assert.equal(isReplicaOrKnockoff("Tênis Adidas 1a linha premium"), true);
  assert.equal(isReplicaOrKnockoff("Tênis 1ª linha qualidade"), true);

  // Produtos legítimos devem passar normalmente
  assert.equal(isReplicaOrKnockoff("Tênis Nike Downshifter 12 Masculino Preto"), false);
  assert.equal(isReplicaOrKnockoff("Tênis Adidas Ultraboost Light Corrida"), false);
  assert.equal(isReplicaOrKnockoff("Tênis Puma Smash V2 Couro Branco"), false);
  assert.equal(isReplicaOrKnockoff("Tênis New Balance 574 Casual"), false);
});

test("Categorias e prioridades oficiais do Radar", () => {
  const alta = RADAR_CATEGORIES.filter((c) => c.priority === "alta").map((c) => c.id);
  const media = RADAR_CATEGORIES.filter((c) => c.priority === "media").map((c) => c.id);
  const menor = RADAR_CATEGORIES.filter((c) => c.priority === "menor").map((c) => c.id);

  assert.ok(alta.includes("moda-fitness-casual"), "Roupas e moda fitness deve ser alta prioridade");
  assert.ok(alta.includes("tenis-marcas"), "Tênis de marca deve ser alta prioridade");
  assert.ok(alta.includes("eletrodomesticos"), "Eletrodomésticos deve ser alta prioridade");

  assert.ok(media.includes("suplementos"), "Suplementos deve ser média prioridade");
  assert.ok(media.includes("beleza-cuidados"), "Beleza e cuidados pessoais deve ser média prioridade");

  assert.ok(menor.includes("eletronicos-games"), "Eletrônicos e games deve ser menor prioridade");
});

test("Priorização de ofertas com alta avaliação e frete grátis", () => {
  const now = new Date().toISOString();
  const mockOffer = (id: string, overrides: Partial<Offer>): Offer => ({
    id,
    source: "mercadolivre",
    externalId: id,
    title: `Produto ${id}`,
    thumbnail: "https://example.com/img.jpg",
    price: 150,
    originalPrice: null,
    discountPercent: null,
    currency: "BRL",
    originalUrl: `https://mercadolivre.com.br/p/${id}`,
    freeShipping: false,
    searchTerm: "Geral",
    status: "pendente",
    affiliateUrl: null,
    coupon: null,
    couponDescription: null,
    rating: null,
    reviewsCount: null,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    statusChangedAt: null,
    ...overrides,
  });

  const o1 = mockOffer("o1", { rating: 4.8, reviewsCount: 120, freeShipping: true });
  const o2 = mockOffer("o2", { rating: 4.0, reviewsCount: 5, freeShipping: false });
  const o3 = mockOffer("o3", { price: 350, rating: 4.6, reviewsCount: 15, freeShipping: true });

  const sorted = sortPrioritizedOffers([o2, o1, o3]);

  // o1 e o3 devem estar na frente de o2 porque atendem aos critérios de alta avaliação
  assert.equal(sorted[0].id === "o1" || sorted[0].id === "o3", true);
  assert.equal(sorted[2].id, "o2");
});
