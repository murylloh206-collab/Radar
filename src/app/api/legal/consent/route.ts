import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { recordConsent } from '@/lib/server/compliance';
import { checkPublicRouteRateLimit } from '@/lib/server/rate-limiter';

/** Grava a escolha de cookies (prova do consentimento, LGPD art. 8º, §2º). Público, com limite por IP. */
export async function POST(req: NextRequest) {
  if (!checkPublicRouteRateLimit(req, 'storefront', 20).allowed) {
    return NextResponse.json({ ok: false, error: 'Muitas tentativas. Tente de novo em um minuto.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const choices = body?.choices;
  if (!choices || typeof choices !== 'object' || typeof body?.version !== 'string') {
    return NextResponse.json({ ok: false, error: 'Escolha inválida.' }, { status: 400 });
  }
  const clean = { analise: Boolean(choices.analise), marketing: Boolean(choices.marketing) };
  const session = getSessionFromRequest(req);
  const saved = await recordConsent({
    kind: 'cookies',
    version: body.version,
    choices: clean,
    userId: session?.userId || null,
    anonId: typeof body.anonId === 'string' && /^[a-z0-9-]{8,64}$/i.test(body.anonId) ? body.anonId : null,
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true, saved });
}
