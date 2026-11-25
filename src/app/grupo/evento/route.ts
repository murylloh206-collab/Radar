import { after, NextRequest, NextResponse } from 'next/server';
import { isBot, recordGroupEvent, sourceOf, visitorCode } from '@/lib/server/group-page-events';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Recebe a visita e o clique da página /grupo (enviados pelo navegador com sendBeacon). Responde na hora. */
export async function POST(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  let body: { kind?: unknown; ref?: unknown; utm?: unknown } = {};
  try { body = JSON.parse(await req.text()); } catch { /* corpo vazio */ }
  const kind = body.kind === 'clique' || body.kind === 'clique_bot' || body.kind === 'visita' ? body.kind : null;
  if (!kind || isBot(ua)) return new NextResponse(null, { status: 204 });
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
  const day = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const visitor = visitorCode(ip, ua, day, process.env.SESSION_SECRET || 'radar');
  const source = sourceOf(typeof body.utm === 'string' ? body.utm : null, typeof body.ref === 'string' ? body.ref : null);
  const task = recordGroupEvent({ kind, visitor, source }).then(() => undefined).catch(() => undefined);
  try { after(task); } catch { void task; }
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
