import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { readDatabase } from '@/lib/server/storage';
import { StoreCredential, StoreName } from '@/lib/types';
import { getDecryptedCredentials, saveStoreCredentials } from '@/lib/server/credentials-vault';
import { registerLinkEvidence } from '@/lib/server/link-evidence';
import { generateShopeeShortLinkDetailed } from '@/lib/server/affiliate-converter';

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Acesso não autorizado. Apenas administradores podem testar integrações de afiliados.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const storeName = body.storeName as StoreName;

    if (!storeName || !['mercadolivre', 'shopee', 'netshoes'].includes(storeName)) {
      return NextResponse.json(
        { ok: false, error: 'Loja inválida. Selecione Mercado Livre, Shopee ou Netshoes.' },
        { status: 400 }
      );
    }

    const db = readDatabase();
    const stored = db.stores.find((s) => s.storeName === storeName);
    let vaultStored = null;
    try {
      vaultStored = await getDecryptedCredentials(session.userId, storeName);
    } catch {}

    // Mescla credenciais enviadas no body com as salvas no cofre criptografado / banco
    const incoming = body.credentials || {};
    const creds: StoreCredential = {
      id: vaultStored?.id || stored?.id || `store_${storeName}`,
      userId: vaultStored?.userId || stored?.userId || session.userId,
      storeName,
      affiliateTag:
        incoming.affiliateTag !== undefined && incoming.affiliateTag.trim().length > 0
          ? incoming.affiliateTag.trim()
          : (vaultStored?.affiliateTag || stored?.affiliateTag || ''),
      appId:
        incoming.appId !== undefined && incoming.appId.trim().length > 0
          ? incoming.appId.trim()
          : (vaultStored?.appId || stored?.appId || ''),
      appSecret:
        incoming.appSecret !== undefined && incoming.appSecret.trim().length > 0
          ? incoming.appSecret.trim()
          : (vaultStored?.appSecret || stored?.appSecret || ''),
      userToken:
        incoming.userToken !== undefined && incoming.userToken.trim().length > 0
          ? incoming.userToken.trim()
          : (vaultStored?.userToken || stored?.userToken || ''),
      isActive: incoming.isActive !== undefined ? Boolean(incoming.isActive) : (vaultStored?.isActive ?? stored?.isActive ?? true),
      updatedAt: new Date().toISOString(),
    };

    let isValid = false;
    let message = '';
    let validationMethod = '';
    let testGeneratedLink: string | null = null;
    let limitationWarning: string | undefined;

    // -------------------------------------------------------------------------
    // 1. TESTE MERCADO LIVRE
    // -------------------------------------------------------------------------
    if (storeName === 'mercadolivre') {
      const toolId = creds.appId?.trim();
      const tag = creds.affiliateTag?.trim();
      const token = creds.userToken?.trim();

      if (!toolId || !tag) {
        return NextResponse.json({
          ok: false,
          error: 'Credenciais incompletas: informe o ID da Ferramenta (matt_tool) e a Tag de Rastreio (matt_word).',
        }, { status: 400 });
      }

      if (toolId.toLowerCase().includes('exemplo') || tag.toLowerCase().includes('exemplo')) {
        return NextResponse.json({
          ok: false,
          error: 'Identificadores de exemplo detectados. Insira suas credenciais reais do Mercado Livre Afiliados.',
        }, { status: 400 });
      }

      // Teste com URL padrão de produto real
      const sampleUrl = 'https://www.mercadolivre.com.br/p/MLB12345678';
      const u = new URL(sampleUrl);
      u.searchParams.set('matt_tool', toolId);
      u.searchParams.set('matt_word', tag);
      testGeneratedLink = u.toString();

      if (token && token.length > 20) {
        // Validação de token via API do Mercado Livre (apenas checa se a conta OAuth existe)
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const mlRes = await fetch('https://api.mercadolibre.com/users/me', {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (mlRes.ok) {
            const mlUser = await mlRes.json();
            // REGRA ESTRITA: Ter token de conta ML NÃO valida os links de afiliados para auto-dispatch,
            // pois o ML Afiliados não possui endpoint para confirmação de comissão por link em tempo real.
            isValid = false;
            validationMethod = 'oauth_autenticado_sem_api_links';
            message = `Conta Mercado Livre autenticada via OAuth (${mlUser.nickname || mlUser.id}).`;
            limitationWarning =
              'Atenção: O Mercado Livre Afiliados não disponibiliza API pública em tempo real para confirmação de links individuais; as ofertas geradas exigirão revisão manual antes de qualquer publicação.';
          } else {
            isValid = false;
            validationMethod = 'api_error';
            message = `Token de acesso rejeitado pela API do Mercado Livre (HTTP ${mlRes.status}).`;
            limitationWarning = 'Token rejeitado. Utilize os parâmetros matt_tool e matt_word em modo de revisão manual.';
          }
        } catch {
          isValid = false;
          message = 'Tempo limite esgotado ao contatar API do Mercado Livre.';
        }
      } else {
        // Sem token de API: apenas parâmetros de link montado
        isValid = false;
        validationMethod = 'deeplink_parametros_sem_api';
        message = 'Parâmetros oficiais matt_tool e matt_word formatados com sucesso para montagem de links.';
        limitationWarning =
          'O Mercado Livre Afiliados não disponibiliza API pública em tempo real para confirmação de links de afiliados. O envio automático sem revisão manual permanece bloqueado por segurança.';
      }
    }

    // -------------------------------------------------------------------------
    // 2. TESTE SHOPEE
    // -------------------------------------------------------------------------
    if (storeName === 'shopee') {
      const appId = creds.appId?.trim();
      const appSecret = creds.appSecret?.trim();
      const subId = creds.affiliateTag?.trim();

      if (!subId && !appId) {
        return NextResponse.json({
          ok: false,
          error: 'Credenciais incompletas: informe seu Sub-ID de rastreio ou o App ID / Secret da Shopee Open API.',
        }, { status: 400 });
      }

      if (appId && appSecret) {
        // Teste de conexão real via Shopee Affiliate GraphQL API (SHA-256 oficial com sincronização de relógio UTC)
        const shopeeResult = await generateShopeeShortLinkDetailed(
          'https://shopee.com.br/product/123/456',
          appId,
          appSecret,
          subId ? [subId] : ['radar']
        );

        if (shopeeResult.ok && shopeeResult.shortLink) {
          isValid = true;
          validationMethod = 'shopee_open_api_graphql';
          testGeneratedLink = shopeeResult.shortLink;
          message =
            'Conexão validada com sucesso via Shopee Open API! Links curtos oficiais gerados e confirmados diretamente pela sua conta.';
        } else {
          isValid = false;
          validationMethod = 'api_error';
          message = shopeeResult.errorMessage
            ? `Shopee Open API retornou erro: ${shopeeResult.errorMessage}`
            : 'Falha na autenticação da Shopee Open API. Verifique seu App ID e Secret.';
        }
      } else {
        // Apenas Sub-ID: gera deeplink mas expõe a limitação real (não validado para auto-dispatch)
        isValid = false;
        validationMethod = 'sub_id_sem_api';
        testGeneratedLink = `https://shopee.com.br/universal-link?utm_medium=affiliates&utm_campaign=${encodeURIComponent(subId || 'radar')}`;
        message = 'Sub-ID de rastreio configurado com sucesso para URLs da Shopee.';
        limitationWarning =
          'A Shopee requer App ID e Secret da Open API para gerar links comprovados pela API. Em modo Sub-ID apenas, o envio automático fica desabilitado e as ofertas exigirão revisão manual.';
      }
    }

    // -------------------------------------------------------------------------
    // 3. TESTE NETSHOES / RAKUTEN
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // 3. TESTE NETSHOES / RAKUTEN
    // -------------------------------------------------------------------------
    if (storeName === 'netshoes') {
      const siteId = creds.affiliateTag?.trim();
      const merchantId = creds.appId?.trim();
      const token = creds.userToken?.trim();

      if (!siteId || !merchantId) {
        return NextResponse.json({
          ok: false,
          error: 'Credenciais incompletas: informe seu Rakuten Site ID e o Merchant ID da Netshoes no seu painel.',
        }, { status: 400 });
      }

      // Validação: não permitir formatos inválidos
      if (siteId.length < 5 || merchantId.length < 3) {
        return NextResponse.json({
          ok: false,
          error: 'Formato inválido para Site ID ou Merchant ID da Netshoes no Rakuten LinkShare.',
        }, { status: 400 });
      }

      const sampleUrl = 'https://www.netshoes.com.br/tenis-exemplo-001';
      testGeneratedLink = `https://click.linksynergy.com/deeplink?id=${encodeURIComponent(siteId)}&mid=${encodeURIComponent(merchantId)}&murl=${encodeURIComponent(sampleUrl)}`;

      // Se houver token Bearer informado, testar via Rakuten Advertising Deep Links API
      if (token && token.length > 15) {
        try {
          const numMerchantId = parseInt(merchantId, 10);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);

          const rakutenRes = await fetch('https://api.linksynergy.com/v1/links/deep_links', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              url: 'https://www.netshoes.com.br/tenis-nike-revolution-7-masculino-preto+branco-JD8-5683-026',
              advertiser_id: isNaN(numMerchantId) ? merchantId : numMerchantId,
              name: 'Radar de Ofertas Teste',
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (rakutenRes.ok) {
            const rData = await rakutenRes.json().catch(() => ({}));
            const apiLink = rData.short_link || rData.deep_link_url || rData.url;
            if (apiLink && typeof apiLink === 'string') {
              isValid = true;
              validationMethod = 'rakuten_deep_links_api';
              testGeneratedLink = apiLink;
              message = 'Conexão validada com sucesso via Rakuten Advertising Deep Links API! Links confirmados pela sua conta.';
            } else {
              isValid = false;
              validationMethod = 'rakuten_deeplink_sem_api';
              message = 'Resposta da Rakuten recebida, porém sem link retornado. Mantido em revisão manual.';
              limitationWarning = 'A Deep Links API não gerou link curto. Ofertas serão mantidas em revisão manual.';
            }
          } else {
            isValid = false;
            validationMethod = 'rakuten_deeplink_sem_api';
            message = `Token Bearer da Rakuten rejeitado (HTTP ${rakutenRes.status}).`;
            limitationWarning = 'Token da Rakuten inválido ou expirado. Deeplinks montados exigirão revisão manual.';
          }
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          isValid = false;
          validationMethod = 'rakuten_deeplink_sem_api';
          message = `Falha de conexão com a Rakuten Deep Links API: ${msg}`;
          limitationWarning = 'Sem comunicação com a API da Rakuten. Ofertas em revisão manual.';
        }
      } else {
        // Sem token Bearer da API
        isValid = false;
        validationMethod = 'rakuten_deeplink_sem_api';
        message = 'Deeplink oficial Netshoes/Rakuten configurado com seu Site ID e Merchant ID.';
        limitationWarning =
          'A Rakuten LinkShare exige token Bearer da Deep Links API para confirmação de links em tempo real; em modo montado, as ofertas exigem revisão manual antes do envio.';
      }
    }

    // Salvar no cofre de credenciais encriptado (SaaS multi-tenant)
    const nowIso = new Date().toISOString();
    await saveStoreCredentials(
      session.userId,
      {
        storeName,
        appId: creds.appId || '',
        affiliateTag: creds.affiliateTag || '',
        appSecret: creds.appSecret,
        userToken: creds.userToken,
        authType: validationMethod as any,
        connectionStatus: isValid ? 'conectado' : 'revisao_manual',
        isActive: creds.isActive,
        lastVerifiedAt: nowIso,
      },
      req
    );

    // Se o teste gerou um link confirmado, registrar evidência auditável
    if (isValid && testGeneratedLink) {
      await registerLinkEvidence({
        userId: session.userId,
        storeName,
        productId: 'TEST_PROD_001',
        productTitle: `Teste de Conexão ${storeName.toUpperCase()}`,
        originalUrl: 'https://exemplo.com/produto',
        cleanUrl: 'https://exemplo.com/produto',
        finalAffiliateUrl: testGeneratedLink,
        confirmationSource: (validationMethod === 'shopee_open_api_graphql' ? 'shopee_graphql_hmac' : 'rakuten_deeplink_api') as any,
        verificationStatus: 'verificado',
        isAutoDispatchAllowed: true,
        expiresInHours: 72,
      });
    }

    return NextResponse.json({
      ok: isValid,
      storeName,
      isValidated: isValid,
      message,
      limitationWarning,
      validationMethod,
      testGeneratedLink,
      lastValidatedAt: nowIso,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
