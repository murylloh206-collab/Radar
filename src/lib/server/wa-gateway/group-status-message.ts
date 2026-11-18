/*
 * Formato do status de grupo (sem dependências, testável).
 *
 * Igual ao WhatsApp Web: a imagem sai como mensagem comum de grupo, com contextInfo.isGroupStatus,
 * e só no último passo (patchMessageBeforeSending do Baileys) é embrulhada em groupStatusMessageV2
 * com um messageSecret de 32 bytes no envelope. Embrulhar só no patch é o que faz o Baileys
 * marcar o envio com mediatype="image" (ele lê o tipo antes do patch). O envio leva ainda o nó
 * <meta is_group_status="true" origin="group_status"/>.
 */

type Msg = Record<string, unknown>;

export const GROUP_STATUS_META_NODE = { tag: 'meta', attrs: { is_group_status: 'true', origin: 'group_status' } } as const;

export const isGroupJid = (jid: unknown): jid is string => typeof jid === 'string' && /^[0-9]+(-[0-9]+)?@g\.us$/.test(jid);

const STATUS_KEYS = ['imageMessage', 'videoMessage', 'extendedTextMessage'] as const;
const statusKey = (message: Msg) => STATUS_KEYS.find(key => message[key]);

/** Marca o conteúdo como status de grupo e garante o segredo de 32 bytes. Não altera o original. */
export function markAsGroupStatus(content: Msg, secret: Uint8Array): Msg {
  const key = statusKey(content);
  if (!key) throw new Error('Conteúdo de mensagem inválido para status de grupo.');
  const node = content[key] as Msg;
  const context = (content.messageContextInfo as Msg | undefined) || {};
  return {
    ...content,
    [key]: { ...node, contextInfo: { ...((node.contextInfo as Msg) || {}), isGroupStatus: true } },
    messageContextInfo: { ...context, messageSecret: context.messageSecret || secret },
  };
}

/**
 * Usado no patchMessageBeforeSending: embrulha só o que foi marcado por markAsGroupStatus.
 * Qualquer outra mensagem passa intacta; chamar duas vezes não embrulha de novo.
 */
export function wrapGroupStatus<T>(message: T): T {
  const msg = message as unknown as Msg;
  if (!msg || msg.groupStatusMessageV2) return message;
  const key = statusKey(msg);
  if (!key || ((msg[key] as Msg).contextInfo as Msg | undefined)?.isGroupStatus !== true) return message;
  const { messageContextInfo, ...inner } = msg;
  return {
    messageContextInfo: { messageSecret: (messageContextInfo as Msg | undefined)?.messageSecret },
    groupStatusMessageV2: { message: inner },
  } as unknown as T;
}

/** Resultado do envio em um grupo, já com a confirmação (ack) do servidor do WhatsApp. */
export interface GroupStatusResult {
  jid: string;
  name?: string;
  ok: boolean;
  messageId?: string;
  /** confirmado: o servidor aceitou; recusado: devolveu erro; sem_confirmacao: não respondeu a tempo. */
  ack?: 'confirmado' | 'recusado' | 'sem_confirmacao';
  error?: string;
}

/** Resume os grupos num resultado de publicação, dizendo pelo nome quais grupos falharam. */
export function summarizeGroupStatus(sent: GroupStatusResult[]): { status: 'publicado' | 'falha' | 'incerto'; externalId?: string; error?: string } {
  const label = (r: GroupStatusResult) => r.name || r.jid.split('@')[0];
  const confirmed = sent.filter(r => r.ok && r.ack === 'confirmado');
  const pending = sent.filter(r => r.ok && r.ack !== 'confirmado');
  const failed = sent.filter(r => !r.ok);
  const notes: string[] = [];
  if (failed.length) notes.push(`Falhou em ${failed.map(r => `${label(r)} (${r.error || 'erro'})`).join(', ')}`);
  if (pending.length) notes.push(`Sem confirmação do WhatsApp em ${pending.map(label).join(', ')}`);
  const externalId = sent.filter(r => r.messageId).map(r => r.messageId).join(',') || undefined;
  const error = notes.length ? notes.join('. ').slice(0, 900) : undefined;
  if (confirmed.length) return { status: 'publicado', externalId, error };
  if (pending.length) return { status: 'incerto', externalId, error };
  return { status: 'falha', externalId, error: error || 'O WhatsApp recusou o status de grupo.' };
}
