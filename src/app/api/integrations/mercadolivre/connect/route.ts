import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, isValidUuid, ADMIN_UUID } from '@/lib/server/auth';
import { saveStoreCredentials } from '@/lib/server/credentials-vault';
import { readDatabase, writeDatabase } from '@/lib/server/storage';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-requested-with',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    const userId = session?.userId && isValidUuid(session.userId) ? session.userId : ADMIN_UUID;

    const body = await req.json().catch(() => ({}));
    const { affiliateTag, appId, accountName, verifiedAt, cookies, cookieString } = body;
    const cleanCookie = (cookieString || cookies || '').trim();

    const cleanTag = (affiliateTag && typeof affiliateTag === 'string' && affiliateTag.trim().length > 0)
      ? affiliateTag.trim()
      : 'michelhenrique1';

    const cleanToolId = (appId && String(appId).trim().length > 0)
      ? String(appId).trim()
      : '77625408';

    const now = verifiedAt || new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const vaultRecord = await saveStoreCredentials(
      userId,
      {
        storeName: 'mercadolivre',
        appId: cleanToolId,
        affiliateTag: cleanTag,
        tagIdentified: cleanTag,
        userToken: cleanCookie || undefined,
        authType: 'extension_session',
        connectionStatus: 'conectado',
        sessionData: {
          accountName: accountName || `Afiliado ML (${cleanTag})`,
          connectedVia: 'chrome_extension_1click',
          hasCookies: Boolean(cleanCookie),
          connectedAt: now,
          expiresAt,
        },
        isActive: true,
        lastVerifiedAt: now,
        expiresAt,
      },
      req
    );

    // Atualiza também no banco de dados operacional local/nuvem
    try {
      const db = readDatabase();
      const ml = db.stores.find((s) => s.storeName === 'mercadolivre');
      if (ml) {
        ml.affiliateTag = cleanTag;
        ml.appId = cleanToolId;
        ml.isActive = true;
        ml.isValidated = true;
        ml.lastValidatedAt = now;
        writeDatabase(db);
      }
    } catch {}

    return NextResponse.json(
      {
        ok: true,
        message: 'Conexão com Mercado Livre confirmada e registrada com sucesso em 1 clique!',
        status: 'conectado',
        affiliateTag: vaultRecord.affiliateTag || cleanTag,
        appId: vaultRecord.appId || cleanToolId,
        lastVerifiedAt: vaultRecord.lastVerifiedAt,
        expiresAt,
        daysRemaining: 30,
        hasCookies: Boolean(cleanCookie),
      },
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}
