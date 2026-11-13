import test from 'node:test';
import assert from 'node:assert/strict';
import { isDuplicateOfferJob } from '../src/lib/server/copier-service';

const dest = '120363000000000002@g.us';
const now = new Date().toISOString();
const sentJob = (over: Record<string, unknown>) => ({
  targetJid: dest, status: 'enviado', sentAt: now, createdAt: now, runtimeDelivery: 'accepted', ...over,
});

test('mesmo item do Mercado Livre com links diferentes é duplicata', () => {
  const existing = [sentJob({
    affiliateUrl: 'https://meli.la/AAA111', originalUrl: 'https://meli.la/ORIG1',
    cleanUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890-tenis-nike-_JM',
    messageText: 'OFERTA ESPECIAL DO DIA! 🎯\n\n*Tênis Nike Revolution 7 Masculino*\n\n🔥 *Por R$ 199,90*\nhttps://meli.la/AAA111',
  })];
  assert.equal(isDuplicateOfferJob({
    targetJid: dest, affiliateUrl: 'https://meli.la/BBB222', originalUrl: 'https://mercadolivre.com/sec/XYZ',
    cleanUrl: 'https://www.mercadolivre.com.br/tenis-nike-revolution-7/p/MLB1234567890', productTitle: 'Tênis Nike Revolution 7 Masculino',
  }, existing), true);
});

test('mesmo produto com título igual (emoji/caixa diferentes) e URLs sem ID é duplicata', () => {
  const existing = [sentJob({
    affiliateUrl: 'https://s.shopee.com.br/AAA', cleanUrl: 'https://shopee.com.br/loja-a',
    messageText: 'Produto com desconto especial que vale a pena hoje! 🔥\n\n*Mochila Viagem Executiva Jiesepote*\n\n🔥 *Por R$ 63,94*\nhttps://s.shopee.com.br/AAA',
  })];
  assert.equal(isDuplicateOfferJob({
    targetJid: dest, affiliateUrl: 'https://s.shopee.com.br/BBB', cleanUrl: 'https://shopee.com.br/loja-b',
    productTitle: '🎒 MOCHILA VIAGEM EXECUTIVA JIESEPOTE',
  }, existing), true);
});

test('produtos diferentes no mesmo grupo não são duplicata', () => {
  const existing = [sentJob({
    affiliateUrl: 'https://s.shopee.com.br/AAA', cleanUrl: 'https://shopee.com.br/loja-a',
    messageText: 'OFERTA ESPECIAL DO DIA! 🎯\n\n*Mochila Viagem Executiva Jiesepote*\n\n🔥 *Por R$ 63,94*\nhttps://s.shopee.com.br/AAA',
  })];
  assert.equal(isDuplicateOfferJob({
    targetJid: dest, affiliateUrl: 'https://s.shopee.com.br/CCC', cleanUrl: 'https://shopee.com.br/loja-c',
    productTitle: 'Kit 2x Creatina Monohidratada Pura Refil 600g',
  }, existing), false);
});

test('mesmo produto em outro grupo de destino não é duplicata', () => {
  const existing = [sentJob({ targetJid: '120363999@g.us', affiliateUrl: 'https://s.shopee.com.br/AAA' })];
  assert.equal(isDuplicateOfferJob({ targetJid: dest, affiliateUrl: 'https://s.shopee.com.br/AAA' }, existing), false);
});
