/*
 * Formato da mensagem de status de grupo (sem dependências, testável).
 * A mídia vai marcada com contextInfo.isGroupStatus e embrulhada em groupStatusMessageV2;
 * o envio leva o nó <meta is_group_status="true"/>. Campos existentes no protocolo oficial (WAProto, Baileys 7).
 */

export const GROUP_STATUS_META_NODE = { tag: 'meta', attrs: { is_group_status: 'true' } } as const;

export const isGroupJid = (jid: unknown): jid is string => typeof jid === 'string' && /^[0-9]+(-[0-9]+)?@g\.us$/.test(jid);

export function buildGroupStatusMessage(content: Record<string, unknown>): { groupStatusMessageV2: { message: Record<string, unknown> } } {
  const type = Object.keys(content).find(key => key.endsWith('Message'));
  if (!type) throw new Error('Conteúdo de mensagem inválido para status de grupo.');
  const inner = { ...(content[type] as Record<string, unknown>) };
  inner.contextInfo = { ...((inner.contextInfo as Record<string, unknown>) || {}), isGroupStatus: true };
  return { groupStatusMessageV2: { message: { ...content, [type]: inner } } };
}
