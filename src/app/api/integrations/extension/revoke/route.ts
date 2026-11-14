import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { revokeAllExtensionTokens } from '@/lib/server/extension-auth';

export const dynamic = 'force-dynamic';

/** "Desvincular extensões": corta o acesso de todas as extensões ligadas a esta conta. */
export async function POST(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login no painel.', code: 'UNAUTHORIZED' }, { status: 401 });
  await revokeAllExtensionTokens(session.userId);
  return NextResponse.json({ ok: true });
}
