import { NextRequest, NextResponse } from 'next/server';
import { convertToAffiliateLink } from '@/lib/server/affiliate-converter';
import { DEFAULT_USER_ID, readDatabase } from '@/lib/server/storage';
import { getSessionFromRequest } from '@/lib/server/auth';
import { getStoreCredentialsMapWithSecrets } from '@/lib/server/credentials-vault';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ ok: false, error: 'URL é obrigatória' }, { status: 400 });
    }

    const session = getSessionFromRequest(req);
    const db = readDatabase();
    const userId = session?.userId || DEFAULT_USER_ID;

    const credentialsMap = await getStoreCredentialsMapWithSecrets(userId, db.stores);

    const result = await convertToAffiliateLink(url, credentialsMap);

    return NextResponse.json({
      ok: result.success,
      data: result,
      error: result.error,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
