import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, inspectRequestSession } from '@/lib/server/auth';

export async function GET(req: NextRequest) {
  const inspection = inspectRequestSession(req);

  if (inspection.valid && inspection.session) {
    return NextResponse.json({
      ok: true,
      authenticated: true,
      hasCookieSession: true,
      expired: false,
      user: {
        userId: inspection.session.userId,
        email: inspection.session.email,
        role: inspection.session.role,
      },
    });
  }

  if (inspection.expired) {
    return NextResponse.json({
      ok: false,
      authenticated: false,
      hasCookieSession: false,
      expired: true,
    });
  }

  const fallbackSession = getSessionFromRequest(req);
  if (!fallbackSession || req.nextUrl.searchParams.get('strict') === '1') {
    return NextResponse.json({
      ok: false,
      authenticated: false,
      hasCookieSession: false,
      expired: false,
    });
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    hasCookieSession: false,
    expired: false,
    user: {
      userId: fallbackSession.userId,
      email: fallbackSession.email,
      role: fallbackSession.role,
    },
  });
}
