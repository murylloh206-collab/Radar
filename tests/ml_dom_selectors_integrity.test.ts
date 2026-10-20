import test from "node:test";
import assert from "node:assert/strict";

import {
  extractSoldQuantity,
  extractReviewsMetrics,
  extractDealCardsFromOfertasHtml,
  parseSoldText,
  ML_DOM_PATTERNS,
} from "../src/lib/server/scanner/ml-dom-extractor";

test("Integridade dos Seletores ML: Extração de Vendidos via aria-label e texto interno", () => {
  // Fixture real do Mercado Livre 1: aria-label no subtítulo
  const sampleHtmlAria = `
    <div class="ui-pdp-header__title-container">
      <span class="ui-pdp-subtitle" aria-label="Novo. Mais de 250 mil vendidos">Novo | +250 mil vendidos</span>
      <h1 class="ui-pdp-title">Módulo Amplificador Taramps TS 400x4</h1>
    </div>
  `;
  const soldAria = extractSoldQuantity(sampleHtmlAria);
  assert.equal(soldAria, 250000, "Deve extrair 250 mil como 250000 a partir do aria-label");

  // Fixture real do Mercado Livre 2: texto direto sem aria-label
  const sampleHtmlText = `
    <span class="ui-pdp-subtitle">Novo | +500 vendidos</span>
  `;
  const soldText = extractSoldQuantity(sampleHtmlText);
  assert.equal(soldText, 500, "Deve extrair 500 vendidos a partir do texto interno");

  // Fixture real do Mercado Livre 3: milhares com ponto
  const sampleHtmlDot = `
    <span class="ui-pdp-subtitle">Novo | +1.500 vendidos</span>
  `;
  const soldDot = extractSoldQuantity(sampleHtmlDot);
  assert.equal(soldDot, 1500, "Deve extrair 1500 tratando o ponto como separador de milhar");
});

test("Integridade dos Seletores ML: Extração de Avaliações e Nota Média", () => {
  // Fixture real do Mercado Livre com rating e amount
  const sampleReviewsHtml = `
    <div class="ui-pdp-reviews">
      <a href="#reviews" class="ui-pdp-review__label ui-pdp-review__label--link">
        <span aria-hidden="true" class="ui-pdp-review__rating">4.9</span>
        <span aria-hidden="true" class="ui-pdp-review__ratings">
          <svg class="ui-pdp-icon ui-pdp-icon--star-full"></svg>
        </span>
        <span aria-hidden="true" class="ui-pdp-review__amount">(46345)</span>
      </a>
    </div>
  `;

  const { rating, reviewsCount } = extractReviewsMetrics(sampleReviewsHtml);
  assert.equal(rating, 4.9, "Deve extrair a nota 4.9 de .ui-pdp-review__rating");
  assert.equal(reviewsCount, 46345, "Deve extrair a contagem 46345 de .ui-pdp-review__amount");
});

test("Integridade dos Seletores ML: Falha visível se as classes mudarem ou forem removidas", () => {
  // HTML quebrado (simulando alteração de classes pelo Mercado Livre)
  const brokenHtml = `
    <div class="ui-pdp-header">
      <span class="classe-nova-desconhecida-subtitulo">Novo | 500 vendidos</span>
      <span class="classe-nova-desconhecida-nota">4.8</span>
      <span class="classe-nova-desconhecida-avaliacoes">(1200)</span>
    </div>
  `;

  const sold = extractSoldQuantity(brokenHtml);
  const { rating, reviewsCount } = extractReviewsMetrics(brokenHtml);

  // Deve retornar null para que o pipeline descarte e acione o alerta de auditoria em scan_runs
  assert.equal(sold, null, "Deve falhar e retornar null se .ui-pdp-subtitle não existir");
  assert.equal(rating, null, "Deve falhar e retornar null se .ui-pdp-review__rating não existir");
  assert.equal(reviewsCount, null, "Deve falhar e retornar null se .ui-pdp-review__amount não existir");
});

test("Integridade dos Seletores ML: Extração de Cards na Vitrine /ofertas", () => {
  const sampleOfertasHtml = `
    <div class="poly-card">
      <div class="poly-card__content">
        <h2 class="poly-component__title">
          <a href="https://www.mercadolivre.com.br/air-fryer-mondial-4l/p/MLB12345678">Fritadeira Sem Óleo Air Fryer Mondial 4L</a>
        </h2>
        <div class="poly-price__current">
          <span class="andes-money-amount__fraction">249</span>
        </div>
        <div class="poly-price__original">
          <span class="andes-money-amount__fraction">399</span>
        </div>
        <span class="poly-price__discount">37% OFF</span>
        <span class="poly-component__shipping">Frete grátis</span>
      </div>
    </div>
  `;

  const cards = extractDealCardsFromOfertasHtml(sampleOfertasHtml);
  assert.equal(cards.length, 1, "Deve extrair exatamente 1 card");
  assert.equal(cards[0].externalId, "MLB12345678");
  assert.equal(cards[0].price, 249);
  assert.equal(cards[0].originalPrice, 399);
  assert.equal(cards[0].discountPercent, 37);
  assert.equal(cards[0].freeShipping, true);
});
