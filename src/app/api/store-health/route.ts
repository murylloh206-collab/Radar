import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { getStoreStatusViews, VIEW_STORES } from '@/lib/server/store-connect';
import { checkStoreConnection } from '@/lib/server/store-health-checks';
import type { StoreName } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const unauthorized = () => NextResponse.json({ ok: false, error: 'Faça login no painel.', code: 'UNAUTHORIZED' }, { status: 401 });

/** Status real das lojas do usuário logado. */
export async function GET(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return unauthorized();
  return NextResponse.json({ ok: true, stores: await getStoreStatusViews(session.userId) }, { headers: { 'Cache-Control': 'no-store' } });
}

/** "Testar agora": refaz o teste de uma loja e devolve o status atualizado. */
export async function POST(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const store = String(body?.store || '') as StoreName;
  if (!VIEW_STORES.includes(store)) return NextResponse.json({ ok: false, error: 'Loja inválida.' }, { status: 400 });
  await checkStoreConnection(session.userId, store);
  return NextResponse.json({ ok: true, stores: await getStoreStatusViews(session.userId) }, { headers: { 'Cache-Control': 'no-store' } });
}
