import { performance } from 'node:perf_hooks';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { copierConnections } from '@/lib/server/copier-group-catalog';
import { copierRulesForConnection } from '@/lib/server/copier-scoped-rules';
import { savedGroupsForConnection } from '@/lib/server/whatsapp-group-cache';
import { connectionView } from '@/lib/server/whatsapp-state';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: 'Sessão necessária.' }, { status: 401, headers });
  const started = performance.now();
  try {
    const connections = await copierConnections(session);
    const id = request.nextUrl.searchParams.get('connectionId');
    const connection = id ? connections.find(account => account.id === id) : connections.find(account => account.isDefault) || connections[0];
    if (id && !connection) return NextResponse.json({ ok: false, error: 'WhatsApp não encontrado nesta conta.' }, { status: 404, headers });
    if (!connection) return NextResponse.json({ ok: true, userId: session.userId, connection: null, connections: [], groups: [], sources: [], destinations: [], syncedAt: null }, { headers });
    const [groups, rules] = await Promise.all([
      savedGroupsForConnection(session, { connection, connections }),
      copierRulesForConnection(session, connection),
    ]);
    return NextResponse.json({ ok: true, userId: session.userId, connection: connectionView(connection),
      connections: connections.map(connectionView), groups: groups.groups, sources: rules.sources,
      destinations: rules.destinations, syncedAt: groups.syncedAt },
    { headers: { ...headers, 'Server-Timing': 'workspace;dur=' + (performance.now() - started).toFixed(1), 'X-Radar-UI': 'workspace-20261102' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Não foi possível carregar suas conexões salvas. Tente novamente.' }, { status: 503, headers });
  }
}
