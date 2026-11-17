import 'server-only';
import type { UserSession } from '@/lib/server/auth';
import { copierConnections } from '@/lib/server/copier-group-catalog';
import { copierRulesForConnection } from '@/lib/server/copier-scoped-rules';
import { savedGroupsForConnection } from '@/lib/server/whatsapp-group-cache';
import { isGroupJid } from './group-status-message';

export const MAX_STATUS_GROUPS = 20;

export interface CopierStatusGroup { jid: string; name: string; participantCount: number | null }

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

/**
 * Os grupos que recebem o status são os mesmos que recebem as ofertas no Copiador:
 * destinos ativos de origens ativas. Usa a conexão do mesmo número pareado no status;
 * se não achar, a conexão padrão.
 */
export async function copierStatusGroups(session: UserSession, gatewayPhone: string | null): Promise<CopierStatusGroup[]> {
  const connections = await copierConnections(session);
  if (!connections.length) return [];
  const phone = digits(gatewayPhone);
  const connection = (phone && connections.find(c => {
    const own = digits((c as { phoneNumber?: string }).phoneNumber);
    return own && (own.endsWith(phone) || phone.endsWith(own));
  })) || connections.find(c => c.isDefault) || connections[0];

  const [rules, saved] = await Promise.all([
    copierRulesForConnection(session, connection),
    savedGroupsForConnection(session, { connection, connections }).catch(() => ({ groups: [] as Array<{ groupJid: string; name: string; participantCount: number }> })),
  ]);
  const activeSources = new Set(rules.sources.filter(source => source.isActive).map(source => source.id));
  const names = new Map(saved.groups.map(group => [group.groupJid, group]));
  const seen = new Set<string>();
  const groups: CopierStatusGroup[] = [];
  for (const destination of rules.destinations) {
    if (!destination.isActive || !activeSources.has(destination.sourceId)) continue;
    if (!isGroupJid(destination.groupJid) || seen.has(destination.groupJid)) continue;
    seen.add(destination.groupJid);
    const known = names.get(destination.groupJid);
    groups.push({ jid: destination.groupJid, name: known?.name || 'Grupo sem nome salvo', participantCount: known?.participantCount ?? null });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
