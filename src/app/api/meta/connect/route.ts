import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { connectMetaAccount, disconnectMetaAccount } from '@/lib/server/meta-graph-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { accessToken, pageId, instagramAccountId } = body;

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'O Token de Acesso da Meta é obrigatório.' },
        { status: 400 }
      );
    }

    const result = await connectMetaAccount(session.userId, {
      accessToken,
      pageId,
      instagramAccountId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Falha ao conectar com a Meta.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Conta da Meta (Instagram / Facebook) conectada com sucesso!',
      integration: result.data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro ao conectar conta da Meta.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const ok = await disconnectMetaAccount(session.userId);
    return NextResponse.json({
      ok,
      message: ok ? 'Integração com a Meta desconectada.' : 'Falha ao desconectar.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro ao desconectar da Meta.' },
      { status: 500 }
    );
  }
}
