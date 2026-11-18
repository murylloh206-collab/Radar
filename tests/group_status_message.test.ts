import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_STATUS_META_NODE, isGroupJid, markAsGroupStatus, wrapGroupStatus } from '../src/lib/server/wa-gateway/group-status-message';

const secret = new Uint8Array(32).fill(7);

test('marca a imagem como status de grupo e põe o segredo de 32 bytes, sem alterar o original', () => {
  const content = { imageMessage: { url: 'https://mmg', caption: 'Oferta #12', contextInfo: { stanzaId: 'x' } } };
  const marked = markAsGroupStatus(content, secret) as Record<string, any>;
  assert.deepEqual(marked.imageMessage.contextInfo, { stanzaId: 'x', isGroupStatus: true });
  assert.equal(marked.imageMessage.caption, 'Oferta #12');
  assert.equal(marked.messageContextInfo.messageSecret, secret);
  assert.equal((content.imageMessage.contextInfo as Record<string, unknown>).isGroupStatus, undefined);
});

test('a imagem marcada continua no topo (o Baileys lê mediatype antes do patch)', () => {
  const marked = markAsGroupStatus({ imageMessage: { caption: 'a' } }, secret);
  assert.ok(marked.imageMessage);
  assert.equal(marked.groupStatusMessageV2, undefined);
});

test('o patch embrulha em groupStatusMessageV2 com o segredo no envelope', () => {
  const wrapped = wrapGroupStatus(markAsGroupStatus({ imageMessage: { caption: 'a' } }, secret)) as Record<string, any>;
  assert.equal(wrapped.messageContextInfo.messageSecret, secret);
  assert.equal(wrapped.groupStatusMessageV2.message.imageMessage.contextInfo.isGroupStatus, true);
  assert.equal(wrapped.groupStatusMessageV2.message.messageContextInfo, undefined);
  assert.equal(wrapped.imageMessage, undefined);
  assert.deepEqual(wrapGroupStatus(wrapped), wrapped, 'não embrulha duas vezes');
});

test('o patch não mexe em mensagens comuns', () => {
  const normal = { imageMessage: { caption: 'oferta no grupo' } };
  assert.equal(wrapGroupStatus(normal), normal);
  assert.throws(() => markAsGroupStatus({}, secret));
});

test('nó meta do envio e validação de JID de grupo', () => {
  assert.deepEqual(GROUP_STATUS_META_NODE, { tag: 'meta', attrs: { is_group_status: 'true', origin: 'group_status' } });
  assert.ok(isGroupJid('120363025246125486@g.us'));
  assert.ok(isGroupJid('5511999999999-1600000000@g.us'));
  assert.ok(!isGroupJid('5511999999999@s.whatsapp.net'));
  assert.ok(!isGroupJid('status@broadcast'));
});

import { summarizeGroupStatus } from '../src/lib/server/wa-gateway/group-status-message';
import { storyTemplateTexts } from '../src/lib/server/offer-art/story-template';

test('resumo: diz pelo nome os grupos sem confirmação ou recusados', () => {
  const r = summarizeGroupStatus([
    { jid: '1@g.us', name: 'Radar de Ofertas #14', ok: true, messageId: 'a', ack: 'confirmado' },
    { jid: '2@g.us', name: 'Radar de Ofertas #16', ok: false, messageId: 'b', ack: 'recusado', error: 'o WhatsApp recusou (erro 479)' },
    { jid: '3@g.us', name: 'Radar de Ofertas #17', ok: true, messageId: 'c', ack: 'sem_confirmacao' },
  ]);
  assert.equal(r.status, 'publicado');
  assert.match(r.error || '', /#16 \(o WhatsApp recusou \(erro 479\)\)/);
  assert.match(r.error || '', /Sem confirmação do WhatsApp em Radar de Ofertas #17/);
  assert.equal(summarizeGroupStatus([{ jid: '3@g.us', ok: true, messageId: 'c', ack: 'sem_confirmacao' }]).status, 'incerto');
  assert.equal(summarizeGroupStatus([{ jid: '3@g.us', ok: false, error: 'x' }]).status, 'falha');
  assert.equal(summarizeGroupStatus([{ jid: '1@g.us', ok: true, messageId: 'a', ack: 'confirmado' }]).error, undefined);
});

test('arte do WhatsApp sai sem "link na bio"; Instagram continua com', () => {
  assert.equal(storyTemplateTexts({ title: 't', current: 10, offerNumber: 12 }).footer, 'Oferta #12 · link na bio');
  const wa = storyTemplateTexts({ title: 't', current: 10, offerNumber: 12, footerCta: '' });
  assert.equal(wa.footer, 'Oferta #12');
  assert.equal(wa.hasCta, false);
  assert.equal(storyTemplateTexts({ title: 't', current: 10, footerCta: '' }).footer, null);
});
