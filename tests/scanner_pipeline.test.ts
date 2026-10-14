import test from "node:test";
import assert from "node:assert/strict";
import {
  validateOfferCandidate,
  checkBlacklist,
  VALIDATION_RULES,
  TITLE_BLACKLIST,
  type CandidateRawItem,
} from "../src/lib/server/scanner/validator";
import { DESIRED_CATEGORIES } from "../src/lib/server/scanner/terms";

test("1. Piso de Preço: Descarte automático abaixo de R$ 80,00", () => {
  const mockItem = (price: number, originalPrice: number | null): CandidateRawItem => ({
    externalId: "MLB123",
    title: "Smartphone Samsung Galaxy A15 128GB",
    thumbnail: "https://example.com/img.jpg",
    price,
    originalPrice,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-123",
    freeShipping: true,
  });

  // Produtos abaixo de R$ 80 devem ser descartados
  const res1 = validateOfferCandidate(mockItem(79.9, 120.0));
  assert.equal(res1.valid, false);
  assert.equal(res1.rejectionCode, "MIN_PRICE");

  const res2 = validateOfferCandidate(mockItem(35.0, 70.0));
  assert.equal(res2.valid, false);
  assert.equal(res2.rejectionCode, "MIN_PRICE");

  // Produto em R$ 80 ou acima passa nessa barreira
  const res3 = validateOfferCandidate(mockItem(80.0, 100.0));
  assert.equal(res3.valid, true);

  const res4 = validateOfferCandidate(mockItem(250.0, 350.0));
  assert.equal(res4.valid, true);
});

test("2. Validação Matemática de Desconto Real >= 15%", () => {
  const createItem = (price: number, originalPrice: number | null, title = "Smartwatch Amazfit Bip"): CandidateRawItem => ({
    externalId: "MLB456",
    title,
    thumbnail: "https://example.com/img.jpg",
    price,
    originalPrice,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-456",
    freeShipping: true,
  });

  // Rejeita se originalPrice não existe
  const resNoOriginal = validateOfferCandidate(createItem(150.0, null));
  assert.equal(resNoOriginal.valid, false);
  assert.equal(resNoOriginal.rejectionCode, "NO_ORIGINAL_PRICE");

  // Rejeita se originalPrice <= price (sem desconto)
  const resNoDiscount = validateOfferCandidate(createItem(200.0, 200.0));
  assert.equal(resNoDiscount.valid, false);
  assert.equal(resNoDiscount.rejectionCode, "NO_ORIGINAL_PRICE");

  // Rejeita se desconto < 15% (ex: de 100 por 90 = 10% OFF)
  const resLow1 = validateOfferCandidate(createItem(90.0, 100.0));
  assert.equal(resLow1.valid, false);
  assert.equal(resLow1.rejectionCode, "LOW_DISCOUNT");

  // Rejeita se desconto < 15% (ex: de 1000 por 860 = 14% OFF)
  const resLow2 = validateOfferCandidate(createItem(860.0, 1000.0));
  assert.equal(resLow2.valid, false);
  assert.equal(resLow2.rejectionCode, "LOW_DISCOUNT");

  // Aprova exatamente 15% de desconto (de 100 por 85 = 15% OFF)
  const resExact15 = validateOfferCandidate(createItem(85.0, 100.0));
  assert.equal(resExact15.valid, true);
  assert.equal(resExact15.discountPercent, 15);

  // Aprova desconto maior que 15% (de 400 por 300 = 25% OFF)
  const res25 = validateOfferCandidate(createItem(300.0, 400.0));
  assert.equal(res25.valid, true);
  assert.equal(res25.discountPercent, 25);
});

test("3. Blacklist de Termos Proibidos: Bloqueio rigoroso de miudezas e acessórios", () => {
  const createWithTitle = (title: string): CandidateRawItem => ({
    externalId: "MLB789",
    title,
    thumbnail: "https://example.com/img.jpg",
    price: 150.0,
    originalPrice: 200.0,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-789",
    freeShipping: true,
  });

  const forbiddenTitles = [
    "Capa de Silicone para iPhone 14 Pro Max",
    "Capinha Anti Impacto Transparente Galaxy S24",
    "Película de Vidro 3D para Xiaomi Poco X6",
    "Cabo USB-C Trançado 2 Metros Carga Rápida",
    "Suporte Veicular Magnético de Celular para Carro",
    "Adaptador HDMI para VGA com Saída de Áudio",
    "Refil Filtro Purificador de Água Consul",
    "Adesivo Decorativo Gamer PlayStation 5",
    "Notebook Dell Inspiron Usado Ótimo Estado",
    "Console PS4 Recondicionado com 2 Controles",
    "Caneca Térmica Personalizada com Nome",
    "Case Rígido para Nintendo Switch Oled",
    "Pulseira de Silicone para Smartwatch Haylou",
    "Induzido Para Parafusadeira Bosch 18V",
    "Estator Para Furadeira Makita Original",
    "Carcaça Completa para Controle Xbox Series",
  ];

  for (const title of forbiddenTitles) {
    const res = validateOfferCandidate(createWithTitle(title));
    assert.equal(
      res.valid,
      false,
      `Deveria ter rejeitado o produto proibido: "${title}"`
    );
    assert.equal(res.rejectionCode, "BLACKLIST_TERM");
  }

  // Títulos legítimos de produtos principais devem passar sem falso positivo
  const allowedTitles = [
    "Smartphone Samsung Galaxy S23 5G 256GB",
    "Notebook Dell Inspiron 15 Core i5 8GB 512GB SSD",
    "Console PlayStation 5 Edição Digital 825GB",
    "Fritadeira Sem Óleo Air Fryer Mondial Grand Family 5L",
    "Parafusadeira e Furadeira de Impacto Bosch GSB 18V",
    "Caixa de Som Portátil Bluetooth JBL Flip 6 À Prova D'água",
  ];

  for (const title of allowedTitles) {
    const res = validateOfferCandidate(createWithTitle(title));
    assert.equal(
      res.valid,
      true,
      `Deveria ter aprovado o produto de alto valor: "${title}"`
    );
  }
});

test("4. Estrutura dos Termos de Desejo e Categorias Premium", () => {
  const categoryIds = DESIRED_CATEGORIES.map((c) => c.id);

  assert.ok(categoryIds.includes("smartphones"), "Deve conter categoria Smartphones");
  assert.ok(categoryIds.includes("notebooks"), "Deve conter categoria Notebooks");
  assert.ok(categoryIds.includes("consoles-games"), "Deve conter categoria Consoles");
  assert.ok(categoryIds.includes("eletrodomesticos-premium"), "Deve conter categoria Eletroportáteis premium");
  assert.ok(categoryIds.includes("ferramentas"), "Deve conter categoria Ferramentas");
  assert.ok(categoryIds.includes("audio"), "Deve conter categoria Áudio");

  // Garante que cada categoria tenha termos preenchidos
  for (const cat of DESIRED_CATEGORIES) {
    assert.ok(cat.terms.length >= 3, `Categoria ${cat.name} deve ter pelo menos 3 termos`);
  }
});
