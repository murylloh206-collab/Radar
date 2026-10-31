import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { copierConnection, copierGroupCatalog, publicCopierConnection } from '@/lib/server/copier-group-catalog';
import { WhatsAppPhotoError } from '@/lib/server/whatsapp-photo-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Sessão necessária.' }, { status: 401, headers });
  let selection: Awaited<ReturnType<typeof copierConnection>> | undefined;
  try {
    selection = await copierConnection(session, req.nextUrl.searchParams.get('connectionId') || undefined);
    const catalog = await copierGroupCatalog(session, {
      connectionId: req.nextUrl.searchParams.get('connectionId') || undefined,
      refresh: req.nextUrl.searchParams.get('refresh') === 'true',
    });
    return NextResponse.json({ ok: true, groups: catalog.groups, syncedAt: catalog.syncedAt,
      connection: { ...publicCopierConnection(catalog.connection), state: 'connected_now', statusLabel: 'Conectado agora' },
      connections: catalog.connections.map(publicCopierConnection) }, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false,
      connections: selection?.connections.map(publicCopierConnection) || [],
      connection: selection ? { ...publicCopierConnection(selection.connection), state: 'unreachable', statusLabel: 'Conexão não confirmada' } : undefined,
      code: error instanceof WhatsAppPhotoError ? error.code : 'CATALOG_ERROR',
      error: error instanceof WhatsAppPhotoError ? error.message : 'Não foi possível consultar os grupos agora.' },
    { status: error instanceof WhatsAppPhotoError ? error.status : 502, headers });
  }
}
