import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, isValidUuid } from '@/lib/server/auth';
import { saveStoreCredentials } from '@/lib/server/credentials-vault';

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session || !session.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Autenticação necessária. Faça login no painel Radar de Ofertas ou pareie a extensão.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }

    const userId = session.userId;
    if (!isValidUuid(userId)) {
      return NextResponse.json(
        { ok: false, error: 'Identificador de usuário inválido (não é um UUID de autenticação).' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { affiliateTag, appId, accountName, verifiedAt, cookies, cookieString } = body;
    const cleanCookie = (cookieString || cookies || '').trim();

    // Proibir tags fictícias ou em branco
    if (
      !affiliateTag ||
      typeof affiliateTag !== 'string' ||
      affiliateTag.trim().length === 0 ||
      affiliateTag.trim() === 'radar_user_tag' ||
      affiliateTag.trim().toLowerCase() === 'tag_ficticia'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Tag real de afiliado do Mercado Livre não foi identificada. Certifique-se de estar logado na sua conta oficial de afiliado do Mercado Livre.',
          code: 'REAL_TAG_REQUIRED',
        },
        { status: 400 }
      );
    }

    const cleanTag = affiliateTag.trim();
    // NÃO usar ferramenta fixa padrão; só persiste appId se o usuário fornecer explicitamente
    const cleanToolId = appId && String(appId).trim().length > 0 ? String(appId).trim() : null;

    const now = verifiedAt || new Date().toISOString();

    const vaultRecord = await saveStoreCredentials(
      userId,
      {
        storeName: 'mercadolivre',
        appId: cleanToolId || undefined,
        affiliateTag: cleanTag,
        tagIdentified: cleanTag,
        userToken: cleanCookie || undefined,
        authType: 'extension_session',
        connectionStatus: 'conectado',
        sessionData: {
          accountName: accountName || 'Conta Mercado Livre',
          connectedVia: cleanCookie ? 'session_cookies' : 'chrome_extension_manifest_v3',
          hasCookies: Boolean(cleanCookie),
          connectedAt: now,
        },
        isActive: true,
        lastVerifiedAt: now,
      },
      req
    );

    return NextResponse.json({
      ok: true,
      message: 'Conexão com Mercado Livre confirmada e registrada com sucesso!',
      status: 'conectado',
      affiliateTag: vaultRecord.affiliateTag,
      lastVerifiedAt: vaultRecord.lastVerifiedAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
