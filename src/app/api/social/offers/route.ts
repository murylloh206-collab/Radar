import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { getSocialQuota, listEligibleOffers } from '@/lib/server/social-posts';

export const dynamic = 'force-dynamic';

/** Ofertas enviadas pelo copiador nas últimas 48h (só do cliente logado) + cota de publicações de hoje. */
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login para continuar.' }, { status: 401 });
  try {
    const [offers, quota] = await Promise.all([listEligibleOffers(session.userId), getSocialQuota(session.userId)]);
    return NextResponse.json({ ok: true, offers, quota }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível carregar as ofertas.' }, { status: 500 });
  }
}
