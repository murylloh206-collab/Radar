import 'server-only';
import { randomBytes } from 'crypto';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { notifyOwner } from '@/lib/server/owner-notify';

/*
 * Registros exigidos pela LGPD e pelo Marco Civil. Gravação "melhor esforço": se o banco falhar,
 * a ação do usuário (login, consentimento) não é bloqueada, mas o erro aparece no log do servidor.
 */

export const TITULAR_KINDS = ['acesso', 'correcao', 'exclusao', 'portabilidade', 'revogacao', 'informacao', 'oposicao', 'outro'] as const;
export type TitularKind = (typeof TITULAR_KINDS)[number];

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : null);

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  return clip(forwarded ? forwarded.split(',')[0].trim() : headers.get('x-real-ip'), 64);
}

async function insert(table: string, row: Record<string, unknown>): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { error } = await supabase.from(table).insert(row);
    if (error) { console.error(`[compliance] falha ao gravar em ${table}:`, error.message); return false; }
    return true;
  } catch (err) {
    console.error(`[compliance] falha ao gravar em ${table}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Registro de acesso / trilha de auditoria (Marco Civil, art. 15). */
export function logAccess(event: string, headers: Headers, userId?: string | null, details: Record<string, unknown> = {}): Promise<boolean> {
  return insert('access_logs', {
    user_id: userId || null,
    event: event.slice(0, 60),
    ip: clientIp(headers),
    user_agent: clip(headers.get('user-agent'), 255),
    details,
  });
}

/** Prova de consentimento ou de aceite (LGPD, art. 8º, §2º). */
export function recordConsent(input: {
  kind: 'cookies' | 'termos'; version: string; choices: Record<string, unknown>; userId?: string | null; anonId?: string | null; userAgent?: string | null;
}): Promise<boolean> {
  return insert('consent_records', {
    user_id: input.userId || null,
    anon_id: clip(input.anonId, 64),
    kind: input.kind,
    version: input.version.slice(0, 32),
    choices: input.choices,
    user_agent: clip(input.userAgent, 255),
  });
}

export function newProtocol(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `LGPD-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Abre pedido de titular, guarda o registro de atendimento e avisa o Encarregado. */
export async function openTitularRequest(input: {
  kind: TitularKind; email: string; details?: string | null; userId?: string | null;
}): Promise<{ ok: boolean; protocol: string }> {
  const protocol = newProtocol();
  const saved = await insert('titular_requests', {
    protocol,
    user_id: input.userId || null,
    email: input.email.slice(0, 160),
    kind: input.kind,
    details: clip(input.details, 2000),
  });
  const notified = await notifyOwner({
    title: `Pedido LGPD (${input.kind}) ${protocol}`,
    body: `Novo pedido de titular. Prazo de resposta completa: 15 dias (LGPD, art. 19). Protocolo ${protocol}.`,
    tags: 'scales',
    priority: 'high',
  });
  return { ok: saved || notified, protocol };
}
