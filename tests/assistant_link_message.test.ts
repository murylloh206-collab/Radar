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
