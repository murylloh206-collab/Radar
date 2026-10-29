import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { saveStoreCredentials, recordAuditLog } from '@/lib/server/credentials-vault';
import { registerLinkEvidence } from '@/lib/server/link-evidence';
import { DEFAULT_USER_ID } from '@/lib/server/storage';

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session || !session.userId) {
      return NextResponse.json(
        { ok: false, error: 'Autenticação necessária. Faça login no painel.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const userId = session.userId;

    const body = await req.json().catch(() => ({}));
    const { token, advertiserId, siteId } = body;

    const cleanToken = token?.trim();
    const cleanAdvertiserId = advertiserId?.trim();
    const cleanSiteId = siteId?.trim();

    if (!cleanAdvertiserId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Advertiser ID (Merchant ID) da Netshoes na Rakuten é obrigatório (não é permitido valor fixo padrão).',
        },
        { status: 400 }
      );
    }

    if (!cleanToken) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Token Bearer da Rakuten Advertising é obrigatório para testar a Deep Links API.',
        },
        { status: 400 }
      );
    }

    const testProductUrl = 'https://www.netshoes.com.br/tenis-nike-revolution-7-masculino-preto+branco-JD8-5683-026';
    const numAdvertiserId = parseInt(cleanAdvertiserId, 10);

    // Chamada oficial à Rakuten Advertising Deep Links API
    let rakutenRes: Response | null = null;
    let apiError: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);

      rakutenRes = await fetch('https://api.linksynergy.com/v1/links/deep_links', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          url: testProductUrl,
          advertiser_id: isNaN(numAdvertiserId) ? cleanAdvertiserId : numAdvertiserId,
          name: 'Radar de Ofertas Teste Conexao',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchErr: unknown) {
      apiError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    }

    if (rakutenRes && rakutenRes.ok) {
      const data = await rakutenRes.json().catch(() => ({}));
      const generatedLink =
        data.short_link ||
        data.deep_link_url ||
        data.link_url ||
        data.url ||
        (Array.isArray(data.links) && data.links[0]?.url);

      if (generatedLink && typeof generatedLink === 'string') {
        // Salvar token encriptado no cofre
        await saveStoreCredentials(
          userId,
          {
            storeName: 'netshoes',
            appId: cleanAdvertiserId,
            affiliateTag: cleanSiteId || '',
            userToken: cleanToken,
            authType: 'rakuten_token',
            connectionStatus: 'conectado',
            isActive: true,
            lastVerifiedAt: new Date().toISOString(),
          },
          req
        );

        // Registrar evidência
        await registerLinkEvidence({
          userId,
          storeName: 'netshoes',
          productId: 'JD8-5683-026',
          productTitle: 'Tênis Nike Revolution 7 Masculino',
          originalUrl: testProductUrl,
          cleanUrl: testProductUrl,
          finalAffiliateUrl: generatedLink,
          confirmationSource: 'rakuten_deeplink_api',
          verificationStatus: 'verificado',
          isAutoDispatchAllowed: true,
          expiresInHours: 72,
        });

        return NextResponse.json({
          ok: true,
          verified: true,
          isAutoDispatchAllowed: true,
          confirmationSource: 'rakuten_deeplink_api',
          testGeneratedLink: generatedLink,
          message: 'Integração confirmada com sucesso pela Rakuten Advertising Deep Links API!',
        });
      }
    }

    // Se a API da Rakuten recusou o token ou o programa não está aprovado
    let statusDetail = apiError || (rakutenRes ? `HTTP ${rakutenRes.status}` : 'Falha de conexão');
    if (rakutenRes && !rakutenRes.ok) {
      try {
        const errJson = await rakutenRes.json();
        statusDetail = errJson.message || errJson.error || statusDetail;
      } catch {}
    }

    // Grava no cofre com status revisao_manual (sem simular sucesso)
    await saveStoreCredentials(
      userId,
      {
        storeName: 'netshoes',
        appId: cleanAdvertiserId,
        affiliateTag: cleanSiteId || '',
        userToken: cleanToken,
        authType: 'rakuten_token',
        connectionStatus: 'revisao_manual',
        isActive: true,
        lastVerifiedAt: new Date().toISOString(),
      },
      req
    );

    return NextResponse.json({
      ok: true,
      verified: false,
      isAutoDispatchAllowed: false,
      confirmationSource: 'parameter_assembled_unverified',
      limitationWarning: `A Rakuten Deep Links API retornou erro (${statusDetail}). O programa pode não estar aprovado ou o token expirou. As ofertas da Netshoes serão mantidas em revisão manual e não serão enviadas automaticamente sem confirmação.`,
      message: 'Credenciais salvas, porém sem confirmação de API ativa. Modo de revisão manual ativado.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
