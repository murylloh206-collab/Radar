import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { publicCopierConnection } from '@/lib/server/copier-group-catalog';
import { connectionView } from '@/lib/server/whatsapp-state';
import { savedWhatsAppGroups, syncWhatsAppGroups } from '@/lib/server/whatsapp-group-cache';
import { WhatsAppPhotoError } from '@/lib/server/whatsapp-photo-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Sessão necessária.' }, { status: 401, headers });
  try {
    const id = req.nextUrl.searchParams.get('connectionId') || undefined;
    const cached = await savedWhatsAppGroups(session, id);
    let catalog: typeof cached = cached;
    let warning: string | undefined;
    if (req.nextUrl.searchParams.get('refresh') === 'true') {
      try { catalog = await syncWhatsAppGroups(session, cached.connection.id); }
      catch { warning = 'A última lista desta conta foi mantida. Não foi possível sincronizar agora.'; }
    }
    return NextResponse.json({ ok: true, groups: catalog.groups, syncedAt: catalog.syncedAt, warning,
      connection: connectionView(catalog.connection), connections: catalog.connections.map(publicCopierConnection) }, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof WhatsAppPhotoError ? error.message : 'Não foi possível ler os grupos salvos.' },
      { status: error instanceof WhatsAppPhotoError ? error.status : 503, headers });
  }
}
