import { NextRequest, NextResponse } from 'next/server';
import { copierConnection } from '@/lib/server/copier-group-catalog';
import { getSessionFromRequest } from '@/lib/server/auth';
import { safeWhatsAppPictureUrl } from '@/lib/server/whatsapp-picture';
import {
  canonicalPhotoOwner, livePhotoGroups, livePhotoOwner, photoConfigKey,
  photoGatewayConfig, photoGatewayRequest, WhatsAppPhotoError,
} from '@/lib/server/whatsapp-photo-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Picture = { pictureUrl: string | null };
const cache = new Map<string, { picture: Picture; expires: number }>();
const pending = new Map<string, Promise<Picture>>();
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return failure('SESSION_REQUIRED', 'Sessão necessária.', 401);
  const params = req.nextUrl.searchParams;
  const account = params.get('account') === '1';
  const jid = params.get('groupJid');
  const expectedOwner = params.get('ownerJid');
  if ((!account && (!jid || !/^\d{5,30}@g\.us$/.test(jid))) || (account && jid) ||
      !expectedOwner || !/^\d{5,30}(?::\d+)?@s\.whatsapp\.net$/.test(expectedOwner)) {
    return failure('INVALID_IDENTITY', 'Atualize a lista de grupos para consultar as fotos.', 400);
  }
  try {
    const connectionId = params.get('connectionId');
    const config = connectionId ? (await copierConnection(session, connectionId)).connection : await photoGatewayConfig(session);
    const owner = await livePhotoOwner(config);
    if (owner !== canonicalPhotoOwner(expectedOwner)) {
      throw new WhatsAppPhotoError('ACCOUNT_CHANGED', 409, 'A conta conectada mudou. Atualize a lista de grupos.');
    }
    const group = account ? undefined : (await livePhotoGroups(config, owner)).find(candidate => candidate.id === jid);
    if (!account && !group) throw new WhatsAppPhotoError('GROUP_NOT_FOUND', 404, 'Grupo indisponível nesta conta.');
    
    const refresh = params.get('refresh') === '1';
    const metadataPicture = !refresh ? safeWhatsAppPictureUrl(group?.pictureUrl) : null;
    if (metadataPicture) return NextResponse.json({ ok: true, pictureUrl: metadataPicture }, { headers });
    
    const number = account ? owner : group!.id;
    const key = JSON.stringify([session.userId, photoConfigKey(config), owner, number]);
    if (refresh) {
      cache.delete(key);
      pending.delete(key);
    } else {
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) return NextResponse.json({ ok: true, ...cached.picture }, { headers });
    }
    let task = pending.get(key);
    if (!task) {
      task = fetchPicture(config, number);
      pending.set(key, task);
    }
    let picture: Picture;
    try { picture = await task; }
    finally { if (pending.get(key) === task) pending.delete(key); }
    cache.set(key, { picture, expires: Date.now() + (picture.pictureUrl ? 600000 : 60000) });
    while (cache.size > 500) cache.delete(cache.keys().next().value!);
    return NextResponse.json({ ok: true, ...picture }, { headers });
  } catch (error) {
    if (error instanceof WhatsAppPhotoError) return failure(error.code, error.message, error.status);
    return failure('PHOTO_UNAVAILABLE', 'Não foi possível obter a foto agora.', 502);
  }
}

async function fetchPicture(config: Awaited<ReturnType<typeof photoGatewayConfig>>, number: string): Promise<Picture> {
  const response = await photoGatewayRequest(config, `/chat/fetchProfilePictureUrl/${encodeURIComponent(config.instanceName)}`, { number });
  if (response.status === 400 || response.status === 404) return { pictureUrl: null };
  if (!response.ok) throw new WhatsAppPhotoError('PHOTO_UNAVAILABLE', 502, 'Foto indisponível no provedor.');
  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new WhatsAppPhotoError('INVALID_PHOTO_RESPONSE', 502, 'Resposta inválida ao consultar a foto.');
  }
  return { pictureUrl: safeWhatsAppPictureUrl(payload.profilePictureUrl) };
}

function failure(code: string, error: string, status: number) {
  return NextResponse.json({ ok: false, code, error }, { status, headers });
}
