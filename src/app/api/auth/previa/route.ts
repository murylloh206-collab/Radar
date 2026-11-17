import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_UUID, SESSION_COOKIE_NAME, signSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * Entrada automática da PRÉVIA LOCAL do redesenho (scripts/previa.mjs).
 * Só existe com NEXT_PUBLIC_PREVIA=1 em desenvolvimento; em produção responde 404.
 */
export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_PREVIA !== '1' || process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 });
  }
  const target = req.nextUrl.searchParams.get('redirect') || '/previa';
  const safe = target.startsWith('/') && !target.startsWith('//') ? target : '/previa';
  const response = NextResponse.redirect(new URL(safe, req.url));
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: signSession({ userId: ADMIN_UUID, email: 'demo@radar.local', role: 'admin' } as any),
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
  });
  return response;
}
