import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { resolveExtensionUser } from '@/lib/server/extension-auth';
import { connectStore, ConnectError } from '@/lib/server/store-connect';

export const dynamic = 'force-dynamic';

/**
 * Conexão do Mercado Livre (sessão do navegador). Exige login no painel ou extensão pareada:
 * nunca grava na conta de outra pessoa.
 */
export async function POST(req: NextRequest) {
  const userId = getStrictSession(req)?.userId || (await resolveExtensionUser(req));
  if (!userId) {
    return NextResponse.json(
      { ok: false, code: 'EXTENSION_UNPAIRED', error: 'Faça login no painel ou reconecte a extensão.' },
      { status: 401 }
    );
  }
  const body = await req.json().catch(() => ({}));
  try {
    const view = await connectStore(userId, {
      store: 'mercadolivre',
      cookies: String(body?.cookieString || body?.cookies || ''),
      tag: body?.affiliateTag ? String(body.affiliateTag) : undefined,
    });
    return NextResponse.json({ ok: view.status === 'ok', status: view }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ConnectError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: 'Não foi possível conectar o Mercado Livre agora.' }, { status: 500 });
  }
}
