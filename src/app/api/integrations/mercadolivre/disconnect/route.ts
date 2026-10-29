import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, isValidUuid } from '@/lib/server/auth';
import { revokeStoreCredentials } from '@/lib/server/credentials-vault';

export async function POST(req: NextRequest) {
  try {
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

    await revokeStoreCredentials(userId, 'mercadolivre', req);

    return NextResponse.json({
      ok: true,
      message: 'Conexão com Mercado Livre revogada e desconectada com sucesso.',
      status: 'desconectado',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
