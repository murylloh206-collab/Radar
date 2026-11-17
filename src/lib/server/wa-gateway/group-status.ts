import 'server-only';
import { randomBytes } from 'node:crypto';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { clearAuthState, loadAuthState } from './auth-store';
import { MAX_STATUS_GROUPS } from './copier-groups';
import { GROUP_STATUS_META_NODE, isGroupJid, markAsGroupStatus, wrapGroupStatus } from './group-status-message';

/*
 * Conector próprio do WhatsApp, sob demanda: abre a conexão, faz o trabalho e fecha.
 * Entra como mais um "aparelho conectado" do número do cliente (o Evolution continua funcionando).
 * O status de grupo não tem API oficial: o formato pode mudar e o envio parar sem aviso.
 */

export class GatewayError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const sessionIdFor = (userId: string) => `gs_${userId}`;

const silentLogger = {
  level: 'silent',
  child() { return silentLogger; },
  trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
};

function db() {
  if (!isSupabaseConfigured || !supabase) throw new GatewayError('Banco de dados não configurado.', 503);
  return supabase;
}

async function setSession(userId: string, patch: Record<string, unknown>) {
  await db().from('wa_gateway_sessions').upsert(
    { session_id: sessionIdFor(userId), user_id: userId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'session_id' },
  );
}

export async function getGatewayStatus(userId: string): Promise<{ status: string; phone: string | null; pairedAt: string | null; lastError: string | null }> {
  const { data, error } = await db().from('wa_gateway_sessions').select('status, phone, paired_at, last_error')
    .eq('session_id', sessionIdFor(userId)).maybeSingle();
  if (error) {
    if (/wa_gateway_sessions/.test(error.message)) throw new GatewayError('Falta rodar a migração 15 no banco.', 503);
    throw new GatewayError(error.message, 500);
  }
  return { status: data?.status || 'desconectado', phone: data?.phone || null, pairedAt: data?.paired_at || null, lastError: data?.last_error || null };
}

type Socket = Awaited<ReturnType<typeof import('baileys')['makeWASocket']>>;

/**
 * Abre a conexão. Durante o pareamento, `onQr` recebe cada QR novo.
 * Depois do QR lido o WhatsApp pede um reinício (código 515): reconectamos uma vez, como manda o Baileys.
 */
async function openSocket(userId: string, options: { onQr?: (qr: string) => void; timeoutMs: number; allowPairing: boolean }): Promise<Socket> {
  const baileys = await import('baileys');
  const sessionId = sessionIdFor(userId);
  const deadline = Date.now() + options.timeoutMs;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { state, saveCreds, isRegistered } = await loadAuthState(sessionId);
    if (!isRegistered && !options.allowPairing) throw new GatewayError('Conecte o status nos grupos pelo QR code antes de publicar.', 409);

    const sock = baileys.makeWASocket({
      auth: { creds: state.creds, keys: baileys.makeCacheableSignalKeyStore(state.keys as never, silentLogger as never) },
      logger: silentLogger as never,
      browser: baileys.Browsers.ubuntu('Radar de Ofertas'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
      fireInitQueries: false,
      // O envelope groupStatusMessageV2 é aplicado aqui, depois que o Baileys já leu o tipo da mídia.
      patchMessageBeforeSending: message => wrapGroupStatus(message),
      // Sem cache de reenvio: um reenvio automático sairia sem a marca de status e viraria
      // mensagem comum no chat do grupo. Preferimos não reenviar.
      enableRecentMessageCache: false,
    });
    sock.ev.on('creds.update', () => { void saveCreds().catch(() => undefined); });

    const outcome = await new Promise<'open' | 'restart' | Error>(resolve => {
      const timer = setTimeout(() => resolve(new GatewayError('O WhatsApp não respondeu a tempo. Tente de novo.', 504)), Math.max(1000, deadline - Date.now()));
      sock.ev.on('connection.update', update => {
        if (update.qr && options.onQr) options.onQr(update.qr);
        if (update.connection === 'open') { clearTimeout(timer); resolve('open'); }
        if (update.connection === 'close') {
          clearTimeout(timer);
          const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          if (code === baileys.DisconnectReason.restartRequired) resolve('restart');
          else if (code === baileys.DisconnectReason.loggedOut) resolve(new GatewayError('O WhatsApp desconectou este aparelho. Conecte de novo pelo QR code.', 401));
          else resolve(new GatewayError(`A conexão com o WhatsApp caiu (código ${code ?? 'desconhecido'}).`, 502));
        }
      });
    });

    if (outcome === 'open') {
      await saveCreds();
      return sock;
    }
    try { sock.end(undefined); } catch { /* já fechado */ }
    if (outcome === 'restart') continue;
    if (outcome instanceof GatewayError && outcome.status === 401) {
      await clearAuthState(sessionId);
      await setSession(userId, { status: 'expirado', last_error: outcome.message });
    }
    throw outcome;
  }
  throw new GatewayError('Não consegui concluir a conexão com o WhatsApp.', 502);
}

function closeSocket(sock: Socket) {
  try { sock.end(undefined); } catch { /* ignore */ }
}

/** Pareamento por QR. Chama `onQr` com cada código e devolve o número conectado. */
export async function pairGateway(userId: string, onQr: (qr: string) => void, timeoutMs = 170_000): Promise<{ phone: string | null }> {
  await clearAuthState(sessionIdFor(userId));
  await setSession(userId, { status: 'pareando', last_error: null });
  try {
    const sock = await openSocket(userId, { onQr, timeoutMs, allowPairing: true });
    const phone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null;
    await setSession(userId, { status: 'conectado', phone, paired_at: new Date().toISOString(), last_error: null });
    await new Promise(resolve => setTimeout(resolve, 1500));
    closeSocket(sock);
    return { phone };
  } catch (error) {
    await setSession(userId, { status: 'desconectado', last_error: error instanceof Error ? error.message : 'Falha no pareamento.' });
    throw error;
  }
}

export async function disconnectGateway(userId: string): Promise<void> {
  try {
    const sock = await openSocket(userId, { timeoutMs: 20_000, allowPairing: false });
    await sock.logout().catch(() => undefined);
    closeSocket(sock);
  } catch { /* se já caiu, só limpamos */ }
  await clearAuthState(sessionIdFor(userId));
  await setSession(userId, { status: 'desconectado', phone: null, last_error: null });
}

export interface GroupStatusResult { jid: string; ok: boolean; messageId?: string; error?: string }

/** Publica a imagem como status em cada grupo escolhido. Um grupo por vez, com intervalo curto entre eles. */
export async function publishGroupStatus(
  userId: string,
  input: { image: Buffer; caption: string; groupJids: string[] },
): Promise<GroupStatusResult[]> {
  const groups = [...new Set(input.groupJids)].filter(isGroupJid);
  if (!groups.length) throw new GatewayError('Nenhum grupo de destino ativo no Copiador.');
  if (groups.length > MAX_STATUS_GROUPS) throw new GatewayError(`O status vai para no máximo ${MAX_STATUS_GROUPS} grupos por vez.`);

  const baileys = await import('baileys');
  const sock = await openSocket(userId, { timeoutMs: 45_000, allowPairing: false });
  const results: GroupStatusResult[] = [];
  try {
    const content = await baileys.generateWAMessageContent(
      { image: input.image, caption: input.caption },
      { upload: sock.waUploadToServer, logger: silentLogger as never },
    );
    for (const [index, jid] of groups.entries()) {
      if (index > 0) await new Promise(resolve => setTimeout(resolve, 2500));
      try {
        const messageId = baileys.generateMessageIDV2(sock.user?.id);
        const message = markAsGroupStatus(content as unknown as Record<string, unknown>, randomBytes(32));
        await sock.relayMessage(jid, message as never, {
          messageId,
          additionalNodes: [GROUP_STATUS_META_NODE],
        });
        results.push({ jid, ok: true, messageId });
      } catch (error) {
        results.push({ jid, ok: false, error: error instanceof Error ? error.message.slice(0, 200) : 'Falha no envio.' });
      }
    }
    await setSession(userId, { status: 'conectado', last_used_at: new Date().toISOString(), last_error: null });
  } finally {
    await new Promise(resolve => setTimeout(resolve, 1200));
    closeSocket(sock);
  }
  return results;
}
