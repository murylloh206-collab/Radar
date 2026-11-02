import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { savedWhatsAppGroups, syncWhatsAppGroups } from '@/lib/server/whatsapp-group-cache';
import { WhatsAppPhotoError } from '@/lib/server/whatsapp-photo-context';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false }, { status: 401, headers });
  try {
    let catalog = await savedWhatsAppGroups(session, req.nextUrl.searchParams.get('connectionId') || undefined);
    let warning: string | undefined;
    if (req.nextUrl.searchParams.get('refresh') === 'true' || req.nextUrl.searchParams.get('sync') === 'true') {
      try { catalog = await syncWhatsAppGroups(session, catalog.connection.id); }
      catch { warning = 'Não foi possível atualizar agora. A última lista confirmada desta conta foi preservada.'; }
    }
    return NextResponse.json({ ok: true, groups: catalog.groups, isLive: catalog.isLive, cachedAt: catalog.syncedAt,
      lastSyncedAt: catalog.syncedAt, connectionId: catalog.connection.id, accountJid: catalog.connection.ownerJid,
      warning, syncWarning: warning }, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof WhatsAppPhotoError ? error.message : 'Não foi possível consultar os grupos salvos.' },
      { status: error instanceof WhatsAppPhotoError ? error.status : 503, headers });
  }
}

export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false }, { status: 400, headers }); }
  if (body.action && body.action !== 'sync') return NextResponse.json({ ok: false }, { status: 400, headers });
  const url = new URL(req.url);
  url.searchParams.set('refresh', 'true');
  if (typeof body.connectionId === 'string') url.searchParams.set('connectionId', body.connectionId);
  return GET(new NextRequest(url, { headers: req.headers }));
}
