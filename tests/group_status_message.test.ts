import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupStatusMessage, GROUP_STATUS_META_NODE, isGroupJid } from '../src/lib/server/wa-gateway/group-status-message';

test('embrulha a imagem em groupStatusMessageV2 e marca isGroupStatus sem perder o contexto', () => {
  const content = { imageMessage: { url: 'https://mmg', caption: 'Oferta #12', contextInfo: { stanzaId: 'x' } } };
  const built = buildGroupStatusMessage(content);
  const inner = built.groupStatusMessageV2.message.imageMessage as Record<string, any>;
  assert.equal(inner.caption, 'Oferta #12');
  assert.deepEqual(inner.contextInfo, { stanzaId: 'x', isGroupStatus: true });
  assert.equal((content.imageMessage.contextInfo as Record<string, unknown>).isGroupStatus, undefined, 'não altera o objeto original');
});

test('recusa conteúdo sem mensagem', () => {
  assert.throws(() => buildGroupStatusMessage({}));
});

test('nó meta do envio e validação de JID de grupo', () => {
  assert.deepEqual(GROUP_STATUS_META_NODE, { tag: 'meta', attrs: { is_group_status: 'true' } });
  assert.ok(isGroupJid('120363025246125486@g.us'));
  assert.ok(isGroupJid('5511999999999-1600000000@g.us'));
  assert.ok(!isGroupJid('5511999999999@s.whatsapp.net'));
  assert.ok(!isGroupJid('status@broadcast'));
});
