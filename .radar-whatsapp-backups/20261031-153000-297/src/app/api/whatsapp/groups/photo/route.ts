import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { getActiveEvolutionConfig, isValidGatewayUrl, readDatabase } from '@/lib/server/storage';
import { safeWhatsAppPictureUrl } from '@/lib/server/whatsapp-picture';

type Picture = { pictureUrl: string | null };
const cache = new Map<string, { value: Picture; expires: number }>();
const pending = new Map<string, Promise<Picture>>();
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Sessão necessária.' }, { status: 401, headers });
  const db = readDatabase();
  if (session.role !== 'admin' && session.userId !== db.whatsapp.userId) {
    return NextResponse.json({ ok: false, error: 'Conta não autorizada.' }, { status: 403, headers });
  }

  const account = req.nextUrl.searchParams.get('account') === '1';
  const jid = req.nextUrl.searchParams.get('groupJid');
  if ((!account && (!jid || !/^\d{5,30}@g\.us$/.test(jid))) || (account && jid)) {
    return NextResponse.json({ ok: false, error: 'Identificação inválida.' }, { status: 400, headers });
  }
  const owner = db.whatsapp.ownerJid;
  if (!owner || db.whatsapp.status !== 'connected') {
    return NextResponse.json({ ok: false, error: 'Confirme a conta conectada primeiro.' }, { status: 409, headers });
  }
  const group = account ? undefined : db.groups.find(item => item.groupJid === jid);
  if (!account && (!group || db.whatsapp.groupsOwnerJid !== owner ||
      (session.role !== 'admin' && group.userId !== session.userId))) {
    return NextResponse.json({ ok: false, error: 'Grupo indisponível nesta conta.' }, { status: 404, headers });
  }

  const config = getActiveEvolutionConfig(db.whatsapp);
  if (!config.baseUrl || !config.apiKey || !config.instanceName || !isValidGatewayUrl(config.baseUrl).valid) {
    return NextResponse.json({ ok: false, error: 'Integração não configurada.' }, { status: 409, headers });
  }
  const number = account ? owner : group!.groupJid;
  const key = JSON.stringify([session.userId, config.baseUrl, config.instanceName, owner, number,
    account ? db.whatsapp.lastPingAt : group!.lastSyncedAt]);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return NextResponse.json({ ok: true, ...cached.value }, { headers });
  const metadataPicture = safeWhatsAppPictureUrl(group?.pictureUrl);
  if (metadataPicture) return NextResponse.json({ ok: true, pictureUrl: metadataPicture }, { headers });

  try {
    let task = pending.get(key);
    if (!task) {
      task = (async (): Promise<Picture> => {
        const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/fetchProfilePictureUrl/${encodeURIComponent(config.instanceName)}`, {
          method: 'POST', headers: { apikey: config.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number }), signal: AbortSignal.timeout(8000), cache: 'no-store',
        });
        if (response.status === 400 || response.status === 404) return { pictureUrl: null };
        if (!response.ok) throw new Error('Foto indisponível no provedor.');
        const data = await response.json();
        return { pictureUrl: safeWhatsAppPictureUrl(data.profilePictureUrl) };
      })();
      pending.set(key, task);
    }
    const picture = await task;
    cache.set(key, { value: picture, expires: Date.now() + (picture.pictureUrl ? 10 * 60_000 : 60_000) });
    while (cache.size > 500) cache.delete(cache.keys().next().value!);
    return NextResponse.json({ ok: true, ...picture }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: 'Não foi possível obter a foto agora.' }, { status: 502, headers });
  } finally {
    pending.delete(key);
  }
}
