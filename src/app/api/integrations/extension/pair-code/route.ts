import { NextRequest, NextResponse } from 'next/server';
import { checkApiAuth } from '@/lib/server/auth';
import { generatePairingCode } from '@/lib/server/pairing-vault';

export async function GET(req: NextRequest) {
  const auth = checkApiAuth(req);
  if (!auth.authorized || !auth.session) {
    return auth.response || NextResponse.json({ ok: false, error: 'Não autorizado', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const result = generatePairingCode(auth.session.userId, auth.session.email);

  return NextResponse.json({
    ok: true,
    code: result.code,
    expiresInSeconds: result.expiresInSeconds,
    userId: auth.session.userId,
    userEmail: auth.session.email,
  });
}
