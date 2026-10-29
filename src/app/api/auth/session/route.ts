import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);

  if (!session) {
    return NextResponse.json({
      ok: false,
      authenticated: false,
    });
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: {
      userId: session.userId,
      email: session.email,
      role: session.role,
    },
  });
}
