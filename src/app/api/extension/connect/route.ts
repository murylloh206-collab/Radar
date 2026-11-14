import { NextRequest, NextResponse } from 'next/server';
import { extensionUserOrResponse } from '@/lib/server/extension-auth';
import { connectStore, ConnectError } from '@/lib/server/store-connect';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** A extensão envia os dados lidos na página da loja; o painel salva no cofre e testa na hora. */
export async function POST(req: NextRequest) {
  const auth = await extensionUserOrResponse(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;
  const body = await req.json().catch(() => null);
  try {
    const view = await connectStore(userId, body);
    return NextResponse.json({ ok: true, status: view }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ConnectError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: 'Não foi possível conectar agora. Tente de novo.' }, { status: 500 });
  }
}
