import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, signSession, isValidUuid } from '@/lib/server/auth';
import { consumePairingCode } from '@/lib/server/pairing-vault';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { pairingCode } = body;

    let targetUserId: string | null = null;
    let targetUserEmail: string = '';

    // 1. Tentar validar via código de pareamento efêmero
    if (pairingCode && typeof pairingCode === 'string' && pairingCode.trim().length > 0) {
      const consumption = consumePairingCode(pairingCode.trim());
      if (consumption.valid && consumption.userId) {
        targetUserId = consumption.userId;
        targetUserEmail = consumption.userEmail || '';
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: consumption.error || 'Código de pareamento inválido ou expirado.',
            code: 'INVALID_PAIRING_CODE',
          },
          { status: 401 }
        );
      }
    }

    // 2. Se não forneceu código, verificar se há cookie de sessão válido no navegador
    if (!targetUserId) {
      const session = getSessionFromRequest(req);
      if (session && session.userId) {
        targetUserId = session.userId;
        targetUserEmail = session.email;
      }
    }

    // 3. Se nenhuma autenticação foi fornecida ou ambas falharam -> HTTP 401 obrigatório
    if (!targetUserId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Autenticação necessária. Forneça um código de pareamento válido ou faça login no painel.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }

    // 4. Validar que o userId é um UUID válido
    if (!isValidUuid(targetUserId)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Identificador de usuário inválido (não é um UUID de autenticação).',
          code: 'INVALID_USER_ID',
        },
        { status: 400 }
      );
    }

    // 5. Emitir token da extensão assinado vinculado ao UUID do usuário (30 dias)
    const extensionToken = signSession(
      {
        userId: targetUserId,
        email: targetUserEmail,
        role: 'user',
      },
      30 * 24 * 60 * 60 * 1000
    );

    return NextResponse.json({
      ok: true,
      message: 'Extensão pareada com sucesso ao painel Radar de Ofertas!',
      userId: targetUserId,
      userEmail: targetUserEmail,
      extensionToken,
      pairedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
