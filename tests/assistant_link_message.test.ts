import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReply, cleanLabel, extractLinks, isPrivateChat, MAX_LINKS_PER_MESSAGE } from '../src/lib/server/assistant/link-message';

test('acha os links com o nome da linha anterior (formato que o dono mandou)', () => {
  const text = [
    'Oferta: Shampoo TRESemmé Hidratação Profunda, 650ml | Hidratação profunda tamanho grande',
    'https://a.co/d/01V5NMGT',
    'TRESemmé Condicionador Hidratação Profunda Frasco 650Ml | Hidratação profunda tamanho grande',
    'https://a.co/d/0f6Sjxij',
  ].join('\n');
  assert.deepEqual(extractLinks(text), [
    { url: 'https://a.co/d/01V5NMGT', label: 'Shampoo TRESemmé Hidratação Profunda, 650ml' },
    { url: 'https://a.co/d/0f6Sjxij', label: 'TRESemmé Condicionador Hidratação Profunda Frasco 650Ml' },
  ]);
});

test('link sozinho, com pontuação no fim, repetido e na mesma linha do texto', () => {
  assert.deepEqual(extractLinks('https://br.shp.ee/Q86LUGmo'), [{ url: 'https://br.shp.ee/Q86LUGmo', label: null }]);
  assert.deepEqual(extractLinks('olha esse: https://meli.la/1yA4x5o.'), [{ url: 'https://meli.la/1yA4x5o', label: 'olha esse' }]);
  assert.equal(extractLinks('https://a.co/d/x1\nhttps://a.co/d/x1').length, 1);
  assert.deepEqual(extractLinks('oi, tudo bem?'), []);
});

test('no máximo 10 links por mensagem', () => {
  const many = Array.from({ length: 14 }, (_, i) => `https://a.co/d/item${i}`).join('\n');
  assert.equal(extractLinks(many).length, MAX_LINKS_PER_MESSAGE);
});

test('nome limpo: sem "Oferta:", sem asteriscos, curto', () => {
  assert.equal(cleanLabel('*Oferta: Fone JBL Tune 520*'), 'Fone JBL Tune 520');
  assert.equal(cleanLabel('🔥🔥 Air Fryer Mondial'), 'Air Fryer Mondial');
  assert.equal(cleanLabel('ok'), null);
  assert.ok((cleanLabel('x'.repeat(200)) || '').length <= 80);
});

test('resposta lista os links convertidos e avisa os que falharam, sem devolver o link original', () => {
  const reply = buildReply([
    { label: 'Shampoo', url: 'https://a.co/d/1', affiliateUrl: 'https://www.amazon.com.br/dp/B0CF479SWM?tag=radardeofe00a-20' },
    { label: 'Condicionador', url: 'https://a.co/d/2', affiliateUrl: 'https://www.amazon.com.br/dp/B0CF497793?tag=radardeofe00a-20' },
    { label: 'Tênis', url: 'https://loja-desconhecida.com/p/1', error: 'loja não suportada' },
  ]);
  assert.match(reply, /Aqui estão os seus 2 links/);
  assert.match(reply, /\*1\. Shampoo\*\nhttps:\/\/www\.amazon\.com\.br\/dp\/B0CF479SWM\?tag=radardeofe00a-20/);
  assert.match(reply, /Não consegui preparar este link:\n• Tênis: loja não suportada/);
  assert.doesNotMatch(reply, /loja-desconhecida\.com/);
});

test('só responde no privado (nunca grupo, status ou broadcast)', () => {
  assert.ok(isPrivateChat('5511999999999@s.whatsapp.net'));
  assert.ok(isPrivateChat('123456789012345@lid'));
  assert.ok(!isPrivateChat('120363025246125486@g.us'));
  assert.ok(!isPrivateChat('status@broadcast'));
  assert.ok(!isPrivateChat(undefined));
});

import { isAssistantOwner } from '../src/lib/server/assistant/access';
import { ADMIN_UUID } from '../src/lib/server/auth';
import { PLANS_CONFIG } from '../src/lib/plans-config';

test('assistente é exclusivo da conta dona e não aparece em nenhum plano', () => {
  assert.equal(isAssistantOwner(ADMIN_UUID), true);
  assert.equal(isAssistantOwner('11111111-2222-3333-4444-555555555555'), false);
  assert.equal(isAssistantOwner(null), false);
  assert.doesNotMatch(JSON.stringify(PLANS_CONFIG), /assistant|Assistente/i);
});

import { replyWithoutLink } from '../src/lib/server/assistant/link-message';

test('sem link: responde ao que a pessoa disse e pede o link', () => {
  assert.match(replyWithoutLink('tudo bem?'), /^Tudo sim.*link do produto/);
  assert.match(replyWithoutLink('Bom diaaa'), /^Bom dia/);
  assert.match(replyWithoutLink('obrigado!!'), /^De nada/);
  assert.match(replyWithoutLink('Olá'), /^Oi!/);
  assert.match(replyWithoutLink('tem cupom?'), /cupom/);
  assert.match(replyWithoutLink('quero uma air fryer'), /link do produto/);
});

import { formatSearch, formatTodayCoupons, formatTodayOffers, MENU_TEXT, parseGroupOffer, parseMenuChoice, trustedHits } from '../src/lib/server/assistant/link-message';

test('menu: números, emojis de número e "menu"', () => {
  assert.equal(parseMenuChoice('1'), 'link');
  assert.equal(parseMenuChoice('2️⃣'), 'ofertas');
  assert.equal(parseMenuChoice('opção 3'), 'cupons');
  assert.equal(parseMenuChoice(' 4. '), 'busca');
  assert.equal(parseMenuChoice('Menu'), 'menu');
  assert.equal(parseMenuChoice('0'), 'menu');
  assert.equal(parseMenuChoice('5'), null);
  assert.equal(parseMenuChoice('quero 2 air fryers'), null);
  assert.match(MENU_TEXT, /1️⃣[\s\S]*2️⃣[\s\S]*3️⃣[\s\S]*4️⃣/);
});

const GTA = "OFERTA ESPECIAL EM GAMES! 🎮\n\n*Grand Theft Auto VI PlayStation 5*\n\nDe: ~R$ 499,00~\n🔥 *Por R$ 371,00* (26% OFF)\n'🎟️ Cupom: *DIADATECH*'\n\n🛒 *Compre aqui com segurança:*\nhttps://meli.la/1yA4x5o\n\n🎯 *Radar de Ofertas*";

test('lê título, preço, cupom e link da mensagem real do grupo', () => {
  assert.deepEqual(parseGroupOffer(GTA, 'https://meli.la/1yA4x5o'),
    { title: 'Grand Theft Auto VI PlayStation 5', price: '371,00', coupon: 'DIADATECH', link: 'https://meli.la/1yA4x5o' });
  assert.equal(parseGroupOffer('sem nada', null), null);
});

test('ofertas e cupons de hoje: listas curtas, aviso de cupom e mensagem quando não há', () => {
  const gta = parseGroupOffer(GTA, null)!;
  assert.match(formatTodayOffers([gta]), /\*1\. Grand Theft Auto VI PlayStation 5\* — R\$ 371,00\nhttps:\/\/meli\.la\/1yA4x5o/);
  assert.match(formatTodayCoupons([gta]), /Cupom: \*DIADATECH\*[\s\S]*pode esgotar/);
  assert.match(formatTodayOffers([]), /ainda não saiu oferta/);
  assert.match(formatTodayCoupons([{ ...gta, coupon: null }]), /ainda não saiu oferta com cupom/);
});

test('busca na Shopee só mostra nota 4,5+ com 100+ vendidos, mais baratos primeiro', () => {
  const hits = trustedHits([
    { title: 'A', price: 300, rating: 4.9, sold: 5000, link: 'https://s.shopee.com.br/a' },
    { title: 'B barata sem nota', price: 90, rating: null, sold: 20, link: 'https://s.shopee.com.br/b' },
    { title: 'C', price: 250, rating: 4.6, sold: 150, link: 'https://s.shopee.com.br/c' },
    { title: 'D nota baixa', price: 100, rating: 4.1, sold: 9000, link: 'https://s.shopee.com.br/d' },
  ]);
  assert.deepEqual(hits.map(h => h.title), ['C', 'A']);
  assert.match(formatSearch('air fryer', hits), /R\$ 250,00 · ⭐ 4,6 · 150 vendidos/);
  assert.match(formatSearch('air fryer', []), /Não achei na Shopee uma opção confiável/);
});

test('"Cupom: ATIVE" não é código de cupom', () => {
  const msg = "*Kit 2 Regata Alcinha Urban*\n\n🔥 *Por R$ 61,00*\n🎟️ Cupom: *ATIVE*\n\nhttps://meli.la/1k6csqZ";
  assert.equal(parseGroupOffer(msg, null)?.coupon, null);
});

import { mercadoLivreVerificationTarget } from '../src/lib/server/url-resolver';
import { countLinks, shortLinkName } from '../src/lib/server/assistant/link-message';

test('verificação do Mercado Livre: usa o produto escrito em go=, só se for do próprio ML', () => {
  const v = 'https://www.mercadolivre.com.br/gz/account-verification?go=https%3A%2F%2Fwww.mercadolivre.com.br%2Fp%2FMLB45892583%3Fmatt_tool%3D38524122&tid=x';
  assert.equal(mercadoLivreVerificationTarget(v), 'https://www.mercadolivre.com.br/p/MLB45892583?matt_tool=38524122');
  assert.equal(mercadoLivreVerificationTarget('https://www.mercadolivre.com.br/gz/account-verification?go=https%3A%2F%2Fevil.com%2Fx'), null);
  assert.equal(mercadoLivreVerificationTarget('https://evil.com/gz/account-verification?go=https%3A%2F%2Fwww.mercadolivre.com.br%2Fp%2FMLB1'), null);
  assert.equal(mercadoLivreVerificationTarget('https://www.mercadolivre.com.br/p/MLB1'), null);
});

test('bot: nome curto quando não há nome do produto e contagem para o aviso de limite', () => {
  assert.equal(shortLinkName('https://meli.la/2nXEGmW'), 'meli.la/2nXEGmW');
  const many = Array.from({ length: 18 }, (_, i) => `https://meli.la/x${i}`).join('\n');
  assert.equal(countLinks(many), 18);
  const reply = buildReply([{ label: null, url: 'https://meli.la/2nXEGmW', affiliateUrl: 'https://meli.la/2YaPc2L' }], { extraLinksIgnored: true });
  assert.match(reply, /\*meli\.la\/2nXEGmW\*\nhttps:\/\/meli\.la\/2YaPc2L/);
  assert.match(reply, /Preparei os 10 primeiros/);
});
