import { NextRequest, NextResponse } from 'next/server';
import { resolveExtensionUser, extensionUnauthorized } from '@/lib/server/extension-auth';
import { getStoreStatusViews } from '@/lib/server/store-connect';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = await resolveExtensionUser(req);
  if (!userId) return extensionUnauthorized();
  return NextResponse.json({ ok: true, stores: await getStoreStatusViews(userId) }, { headers: { 'Cache-Control': 'no-store' } });
}
