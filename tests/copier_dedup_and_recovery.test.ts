import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeIncomingOfferFingerprint,
  extractCanonicalProductId,
  extractOfferDetailsFromWhatsAppText,
  extractProductTitleFromFormattedMessage,
  extractUrlsFromText,
  extractWhatsAppMessageText,
  isDuplicateOfferJob,
  isPromotionalHookLine,
  normalizeOfferUrlForDedup,
  stripInvisibleChars,
} from '../src/lib/server/copier-service';
import type { PublicationJob } from '../src/lib/types';

test('stripInvisibleChars e extractUrlsFromText removem caracteres invisíveis de múltiplos bots no grupo de origem', () => {
  const bot1Text = `*Lowe Summer!* ☀️\nPerfume Masculino 100ml\nPor *R$ 89,90*\nhttps://meli.la/13wbPz6\u2063\u2063`;
  const bot2Text = `*Lowe Summer!* ☀️\nPerfume Masculino 100ml\nPor *R$ 89,90*\nhttps://meli.la/13wbPz6\u200c\u200d\u200b`;

  assert.equal(stripInvisibleChars(bot1Text), stripInvisibleChars(bot2Text));
  const urls1 = extractUrlsFromText(bot1Text);
  const urls2 = extractUrlsFromText(bot2Text);
  assert.deepEqual(urls1, ['https://meli.la/13wbPz6']);
  assert.deepEqual(urls2, ['https://meli.la/13wbPz6']);

  const fp1 = computeIncomingOfferFingerprint(bot1Text);
  const fp2 = computeIncomingOfferFingerprint(bot2Text);
  assert.deepEqual(fp1.normalizedUrls, fp2.normalizedUrls);
  assert.equal(fp1.normalizedText, fp2.normalizedText);
});

test('extractWhatsAppMessageText limpa caracteres zero-width do payload da Evolution API', () => {
  const raw = {
    message: {
      extendedTextMessage: {
        text: 'Oferta Top\nhttps://meli.la/2kHG9cL\u2063\u200c',
      },
    },
  };
  const extracted = extractWhatsAppMessageText(raw);
  assert.equal(extracted, 'Oferta Top\nhttps://meli.la/2kHG9cL');
});

test('isPromotionalHookLine detecta linhas de gancho com emoji seguido de asterisco (*...😉*) e preserva o nome real do produto', () => {
  const hookWithTrailingAsterisk = '*PRA SAIR DE CASA DEIXANDO AQUELE CARTÃO DE VISITA! 😉*';
  assert.equal(isPromotionalHookLine(hookWithTrailingAsterisk), true);

  const sampleText = [
    '*PRA SAIR DE CASA DEIXANDO AQUELE CARTÃO DE VISITA! 😉*',
    '*O Boticário Zaad Eau De Parfum 50ml*',
    'De ~R$ 299,90~',
    'Por *R$ 173,00*',
    'https://meli.la/2kHG9cL',
  ].join('\n');

  const details = extractOfferDetailsFromWhatsAppText(sampleText, 'Mercado Livre');
  assert.equal(details.title, 'O Boticário Zaad Eau De Parfum 50ml');
});

test('extractCanonicalProductId extrai MLB e IDs da Shopee de diferentes formatos de URL', () => {
  assert.equal(
    extractCanonicalProductId('https://produto.mercadolivre.com.br/MLB-3849201928-tenis-nike-_JM'),
    'mlb:MLB3849201928'
  );
  assert.equal(
    extractCanonicalProductId('https://www.mercadolivre.com.br/p/MLB19827364?matt_tool=123'),
    'mlb:MLB19827364'
  );
  assert.equal(
    extractCanonicalProductId('https://shopee.com.br/product/123456/987654321?utm_source=an_11'),
    'shopee:123456:987654321'
  );
});

test('normalizeOfferUrlForDedup remove parâmetros de rastreamento voláteis preservando a identidade do link', () => {
  const u1 = normalizeOfferUrlForDedup('https://www.mercadolivre.com.br/p/MLB19827364?matt_tool=84781987&matt_word=ws2');
  const u2 = normalizeOfferUrlForDedup('https://www.mercadolivre.com.br/p/MLB19827364?matt_tool=99999999&utm_source=whatsapp');
  assert.equal(u1, u2);
});

test('isDuplicateOfferJob bloqueia duplicatas mesmo quando o shortlink meli.la muda ou quando o job anterior ficou em runtimeDelivery=uncertain', () => {
  const nowIso = new Date().toISOString();
  const baseJob: PublicationJob & { runtimeDelivery?: string | null; cleanUrl?: string } = {
    id: 'job-1',
    userId: 'user-1',
    connectionId: 'conn-1',
    originType: 'copiador',
    sourceId: 'src-1',
    targetJid: '120363412589119281@g.us',
    targetName: 'Radar de Ofertas #1',
    messageText: '🔥 *Achado com preço reduzido!*\n\n📦 *O Boticário Zaad Eau De Parfum 50ml*\n\n💰 *Por R$ 173,00*\n\n🛒 *Compre aqui:* https://meli.la/aaa111',
    mediaType: 'image',
    affiliateUrl: 'https://meli.la/aaa111',
    originalUrl: 'https://meli.la/2kHG9cL',
    cleanUrl: 'https://www.mercadolivre.com.br/o-boticario-zaad/p/MLB12345678',
    status: 'falha',
    runtimeDelivery: 'uncertain', // Evolution API enviou, mas deu timeout na resposta
    scheduledFor: nowIso,
    attempts: 1,
    maxAttempts: 3,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Caso 1: Mesmo originalUrl do 2º bot, mas gerou um novo shortlink meli.la/bbb222 e o 1º job está como falha + uncertain
  assert.equal(
    isDuplicateOfferJob(
      {
        targetJid: '120363412589119281@g.us',
        affiliateUrl: 'https://meli.la/bbb222',
        originalUrl: 'https://meli.la/2kHG9cL\u2063',
        cleanUrl: 'https://www.mercadolivre.com.br/o-boticario-zaad/p/MLB12345678',
        externalId: 'MLB12345678',
        productTitle: 'O Boticário Zaad Eau De Parfum 50ml',
      },
      [baseJob],
      24
    ),
    true
  );

  // Caso 2: Mesmo MLB ID vindo de outro link encurtado diferente
  assert.equal(
    isDuplicateOfferJob(
      {
        targetJid: '120363412589119281@g.us',
        affiliateUrl: 'https://meli.la/ccc333',
        originalUrl: 'https://meli.la/outroLink',
        cleanUrl: 'https://produto.mercadolivre.com.br/MLB-12345678-zaad-_JM',
        externalId: 'MLB12345678',
        productTitle: 'Perfume Zaad 50ml',
      },
      [baseJob],
      24
    ),
    true
  );

  // Caso 3: Mesmo título do produto extraído da mensagem formatada
  const extractedTitle = extractProductTitleFromFormattedMessage(baseJob.messageText);
  assert.equal(extractedTitle, 'O Boticário Zaad Eau De Parfum 50ml');
  assert.equal(
    isDuplicateOfferJob(
      {
        targetJid: '120363412589119281@g.us',
        affiliateUrl: 'https://meli.la/ddd444',
        originalUrl: 'https://meli.la/linkDiferente',
        productTitle: 'O Boticário Zaad Eau De Parfum 50ml',
      },
      [baseJob],
      24
    ),
    true
  );

  // Caso 4: Produto completamente diferente não deve ser bloqueado
  assert.equal(
    isDuplicateOfferJob(
      {
        targetJid: '120363412589119281@g.us',
        affiliateUrl: 'https://meli.la/novo999',
        originalUrl: 'https://meli.la/orig999',
        cleanUrl: 'https://www.mercadolivre.com.br/tenis-nike/p/MLB99999999',
        externalId: 'MLB99999999',
        productTitle: 'Tênis Nike Air Max Masculino',
      },
      [baseJob],
      24
    ),
    false
  );
});

