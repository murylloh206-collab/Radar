import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, isValidUuid } from '@/lib/server/auth';
import { getSafeVaultStatus } from '@/lib/server/credentials-vault';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || !session.userId) {
    return NextResponse.json(
      { ok: false, error: 'Autenticação necessária.', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const userId = session.userId;
  if (!isValidUuid(userId)) {
    return NextResponse.json(
      { ok: false, error: 'Identificador de usuário inválido.' },
      { status: 400 }
    );
  }

  const statuses = await getSafeVaultStatus(userId);
  const mlStatus = statuses.find((s) => s.storeName === 'mercadolivre');

  return NextResponse.json({
    ok: true,
    status: mlStatus?.connectionStatus || 'desconectado',
    affiliateTag: mlStatus?.tagIdentified || mlStatus?.affiliateTag || null,
    lastVerifiedAt: mlStatus?.lastVerifiedAt || null,
    requiresBrowserExtension: true,
    isActive: mlStatus?.isActive ?? false,
  });
}
