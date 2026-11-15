import 'server-only';
import type { UserSession } from '@/lib/server/auth';
import { copierGroupCatalog } from '@/lib/server/copier-group-catalog';
import { photoGatewayRequest } from '@/lib/server/whatsapp-photo-context';
import { pickRotationGroup, rotationQueue } from '@/lib/server/group-rotation';

/*
 * Convite do grupo da vez para o /grupo/entrar. Nunca lança: em falha usa o último link bom ou o fixo.
 */
export const FALLBACK_GROUP_INVITE = 'https://chat.whatsapp.com/BU0EXrYHWFk2qLdmqopMTs';
const OWNER_ID = '00000000-0000-0000-0000-000000000001';
const PICK_TTL = 60_000;
const INVITE_TTL = 10 * 60_000;
const WARN_EVERY = 12 * 60 * 60_000;

let picked: { url: string; number: number | null; expires: number; source: string } | null = null;
export let lastRotationSource = 'none';
let lastGood: { url: string; number: number | null } | null = null;
let lastWarnAt = 0;
const inviteCache = new Map<string, { url: string; expires: number }>();

const numberEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

function ownerSession(): UserSession {
  const now = Date.now();
  return { userId: OWNER_ID, email: 'owner@radar.local', role: 'admin', createdAt: now, expiresAt: now + 60_000 };
}

async function inviteFor(connection: Parameters<typeof photoGatewayRequest>[0], groupJid: string): Promise<string> {
  const cached = inviteCache.get(groupJid);
  if (cached && cached.expires > Date.now()) return cached.url;
  const response = await photoGatewayRequest(connection,
    `/group/inviteCode/${encodeURIComponent(connection.instanceName)}?groupJid=${encodeURIComponent(groupJid)}`);
  if (!response.ok) throw new Error(`inviteCode ${response.status}`);
  const data = await response.json() as { inviteUrl?: string; inviteCode?: string };
  const url = typeof data.inviteUrl === 'string' && data.inviteUrl.startsWith('https://chat.whatsapp.com/')
    ? data.inviteUrl
    : typeof data.inviteCode === 'string' && /^[A-Za-z0-9]{10,40}$/.test(data.inviteCode) ? `https://chat.whatsapp.com/${data.inviteCode}` : '';
  if (!url) throw new Error('inviteCode vazio');
  inviteCache.set(groupJid, { url, expires: Date.now() + INVITE_TTL });
  return url;
}

async function warnNewGroup(nextNumber: number, lastName: string, lastCount: number): Promise<void> {
  if (Date.now() - lastWarnAt < WARN_EVERY) return;
  lastWarnAt = Date.now();
  const { notifyOwner } = await import('./owner-notify');
  await notifyOwner({
    title: `Crie o grupo #${nextNumber}`,
    body: `${lastName} já tem ${lastCount} membros. Crie "Radar de Ofertas #${nextNumber}" e adicione como destino no copiador.`,
    tags: 'busts_in_silhouette',
    priority: 'high',
  });
}

export interface RotationTarget { url: string; number: number | null }

export async function resolveRotationInvite(): Promise<string> {
  return (await resolveRotationTarget()).url;
}

/** Grupo da vez: link de convite e o número (#N) para mostrar na página. */
export async function resolveRotationTarget(): Promise<RotationTarget> {
  if (picked && picked.expires > Date.now()) { lastRotationSource = picked.source; return { url: picked.url, number: picked.number }; }
  const fallback = (): RotationTarget => lastGood || { url: FALLBACK_GROUP_INVITE, number: null };
  try {
    const { connection, groups } = await copierGroupCatalog(ownerSession(), {});
    const queue = rotationQueue(groups, process.env.GROUP_ROTATION_PREFIX ?? undefined);
    const choice = pickRotationGroup(queue, numberEnv('GROUP_ROTATION_LIMIT', 500), numberEnv('GROUP_ROTATION_WARN', 400));
    if (!choice) { lastRotationSource = `fallback:fila-vazia(${groups.length} grupos)`; return fallback(); }
    if (choice.needsNew) {
      const last = queue[queue.length - 1];
      void warnNewGroup(last.number + 1, last.name, last.participantCount);
    }
    const url = await inviteFor(connection, choice.group.groupJid);
    lastGood = { url, number: choice.group.number };
    picked = { url, number: choice.group.number, expires: Date.now() + PICK_TTL, source: `#${choice.group.number}:${choice.group.participantCount}` };
    lastRotationSource = picked.source;
    return lastGood;
  } catch (error) {
    lastRotationSource = `fallback:${error instanceof Error ? (error as any).code || error.message : 'erro'}`.slice(0, 120);
    return fallback();
  }
}
