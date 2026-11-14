import { NextRequest, NextResponse } from 'next/server';
import { extensionUserOrResponse } from '@/lib/server/extension-auth';
import { getStoreStatusViews } from '@/lib/server/store-connect';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await extensionUserOrResponse(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;
  return NextResponse.json({ ok: true, stores: await getStoreStatusViews(userId) }, { headers: { 'Cache-Control': 'no-store' } });
}
