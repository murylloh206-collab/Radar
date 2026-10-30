import crypto from 'crypto';
import { StoreCredential, StoreName } from '../types';
import { detectStoreFromUrl, resolveUrlSafely } from './url-resolver';
import { registerLinkEvidence } from './link-evidence';
import { DEFAULT_USER_ID } from './storage';

export type AffiliateVerificationStatus = 'verificado' | 'nao_verificado' | 'rejeitado';
export type LinkState = 'gerado' | 'confirmado_pela_integracao' | 'apto_para_envio';

export interface ConvertAffiliateResult {
  success: boolean;
  store: StoreName | null;
  originalUrl: string;
  cleanUrl: string;
  affiliateUrl: string | null;
  verificationStatus: AffiliateVerificationStatus;
  isAutoDispatchAllowed: boolean;
  linkState: LinkState;
  error?: string;
  meta?: {
    productId?: string;
    affiliateTagUsed?: string;
    appIdUsed?: string;
    verificationReason?: string;
    integrationTested?: boolean;
    extractedImageUrl?: string;
  };
}

/**
 * Remove parâmetros de rastreamento de afiliados de terceiros de uma URL
 */
export function sanitizeStoreUrl(urlStr: string, store: StoreName): string {
  try {
    const url = new URL(urlStr);

    const thirdPartyParams = [
      'tag',
      'ascsubtag',
      'matt_tool',
      'matt_word',
      'af_sub1',
      'af_sub2',
      'af_sub3',
      'af_sub4',
      'af_sub5',
      'af_c_id',
      'c',
      'pid',
      'is_retargeting',
      'af_reengagement_window',
      'af_click_lookback',
      'aff_platform',
      'af_dp',
      'mmp_pid',
      'uls_trackid',
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
      'utm_term',
      'sub_id',
      'd_id',
      'sp_atk',
      'xptdk',
    ];

    thirdPartyParams.forEach((param) => {
      url.searchParams.delete(param);
    });

    if (store === 'mercadolivre') {
      url.searchParams.delete('variation');
      url.searchParams.delete('pdp_filters');
      url.searchParams.delete('searchVariation');
    }

    if (store === 'shopee') {
      url.search = '';
    }

    if (store === 'amazon') {
      url.searchParams.delete('ref');
      url.searchParams.delete('ref_');
      url.searchParams.delete('keywords');
      url.searchParams.delete('qid');
      url.searchParams.delete('sr');
    }

    return url.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Extrai ID único do produto por loja
 */
export function extractProductId(urlStr: string, store: StoreName): string | null {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname;

    if (store === 'mercadolivre') {
      const mlbMatch = pathname.match(/MLB-?(\d+)/i) || urlStr.match(/MLB-?(\d+)/i);
      if (mlbMatch) return `MLB${mlbMatch[1]}`;
    }

    if (store === 'shopee') {
      url.search = '';
    }

    if (store === 'amazon') {
      const asinMatch = pathname.match(/\/dp\/([A-Z0-9]{10})/i) || pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      if (asinMatch) return asinMatch[1];
    }

    if (store === 'shopee') {
      const shopeeMatch =
        pathname.match(/-i\.(\d+)\.(\d+)/) ||
        pathname.match(/\/product\/(\d+)\/(\d+)/) ||
        pathname.match(/\/opaanlp\/(\d+)\/(\d+)/);
      if (shopeeMatch) return `${shopeeMatch[1]}.${shopeeMatch[2]}`;
    }

    if (store === 'netshoes') {
      const netshoesMatch = pathname.match(/\/([a-zA-Z0-9_-]+-[0-9]{3})(?:\?|$|\/)/) || pathname.match(/\/p\/([a-zA-Z0-9]+)/i);
      if (netshoesMatch) return netshoesMatch[1];
    }

    if (store === 'magalu') {
      const magaluMatch = pathname.match(/\/p\/([a-z0-9]+)/i);
      if (magaluMatch) return magaluMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Verifica se um identificador é genérico, fictício ou de exemplo
 */
function isDummyOrExampleId(val?: string | null): boolean {
  if (!val) return false;
  const lower = val.trim().toLowerCase();
  const dummyList = [
    'exemplo',
    'example',
    'sample',
    'teste',
    'test',
    '12345',
    '123456',
    '0000',
    'meu_id',
    'meu_rastreio',
    'minha_ferramenta',
    'sua_tag',
    'sua-tag',
    'radar_user_tag',
    'tag_ficticia',
    '19379659',
  ];
  return dummyList.some((d) => lower.includes(d));
}

let shopeeClockOffsetSec = 0;

export interface ShopeeShortLinkResponse {
  ok: boolean;
  shortLink: string | null;
  httpStatus?: number;
  errorMessage?: string;
}

export async function generateShopeeShortLinkDetailed(
  originalUrl: string,
  appId: string,
  appSecret: string,
  subIds: string[] = []
): Promise<ShopeeShortLinkResponse> {
  const cleanAppId = appId.trim();
  const cleanAppSecret = appSecret.trim();
  const sanitizedSubIds = subIds
    .map((s) => String(s || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50))
    .filter(Boolean);

  const subIdsArg = sanitizedSubIds.length > 0 ? `, subIds: ${JSON.stringify(sanitizedSubIds)}` : '';
  const query = `mutation { generateShortLink(input: { originUrl: ${JSON.stringify(originalUrl)}${subIdsArg} }) { shortLink } }`;
  const payload = JSON.stringify({ query });

  const executeCall = async (ts: number) => {
    const factor = `${cleanAppId}${ts}${payload}${cleanAppSecret}`;
    const signature = crypto.createHash('sha256').update(factor, 'utf8').digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `SHA256 Credential=${cleanAppId}, Timestamp=${ts}, Signature=${signature}`,
        },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const dateHeader = res.headers.get('date');
      const json = await res.json().catch(() => ({}));
      return { res, dateHeader, json };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  };

  try {
    const localNowSec = Math.floor(Date.now() / 1000);
    const initialTimestamp = localNowSec + shopeeClockOffsetSec;
    let { res, dateHeader, json } = await executeCall(initialTimestamp);

    // Se o relógio local divergir do relógio UTC real da Shopee (> 60s), sincroniza automaticamente e refaz a chamada assinada
    if (dateHeader) {
      const serverSec = Math.floor(new Date(dateHeader).getTime() / 1000);
      if (!isNaN(serverSec) && Math.abs(serverSec - initialTimestamp) > 60) {
        shopeeClockOffsetSec = serverSec - Math.floor(Date.now() / 1000);
        if (!res.ok || json?.errors?.length) {
          const retry = await executeCall(serverSec);
          res = retry.res;
          json = retry.json;
        }
      }
    }

    const link = json?.data?.generateShortLink?.shortLink;
    if (res.ok && link && typeof link === 'string' && link.startsWith('http')) {
      return {
        ok: true,
        shortLink: link,
        httpStatus: res.status,
      };
    }

    if (json?.errors && Array.isArray(json.errors) && json.errors.length > 0) {
      return {
        ok: false,
        shortLink: null,
        httpStatus: res.status,
        errorMessage: json.errors[0]?.message || 'Credenciais ou assinatura recusadas pela Shopee Open API.',
      };
    }

    return {
      ok: false,
      shortLink: null,
      httpStatus: res.status,
      errorMessage: `Falha na autenticação da Shopee Open API (HTTP ${res.status}).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      shortLink: null,
      errorMessage: `Erro ao comunicar com a Shopee Open API: ${msg}`,
    };
  }
}

async function tryGenerateShopeeShortLink(
  originalUrl: string,
  appId: string,
  appSecret: string,
  subIds: string[] = []
): Promise<string | null> {
  const res = await generateShopeeShortLinkDetailed(originalUrl, appId, appSecret, subIds);
  return res.ok ? res.shortLink : null;
}

async function fetchShopeeProductImageByItemId(
  itemId: string,
  appId: string,
  appSecret: string
): Promise<string | undefined> {
  if (!/^\d+$/.test(itemId)) return undefined;
  try {
    const cleanAppId = appId.trim();
    const cleanAppSecret = appSecret.trim();
    const query = `{ productOfferV2(itemId: ${itemId}, limit: 1) { nodes { imageUrl } } }`;
    const payload = JSON.stringify({ query });
    const ts = Math.floor(Date.now() / 1000) + shopeeClockOffsetSec;
    const factor = `${cleanAppId}${ts}${payload}${cleanAppSecret}`;
    const signature = crypto.createHash('sha256').update(factor, 'utf8').digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `SHA256 Credential=${cleanAppId}, Timestamp=${ts}, Signature=${signature}`,
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return undefined;
    const json = await res.json().catch(() => ({}));
    const img = json?.data?.productOfferV2?.nodes?.[0]?.imageUrl;
    if (img && typeof img === 'string' && img.startsWith('http')) {
      return img.replace(/_tn(\.[a-z]+)?$/i, '');
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function tryGenerateRakutenDeepLink(
  originalUrl: string,
  advertiserId: string,
  bearerToken: string
): Promise<string | null> {
  try {
    const numAdvertiserId = parseInt(advertiserId, 10);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('https://api.linksynergy.com/v1/links/deep_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        url: originalUrl,
        advertiser_id: isNaN(numAdvertiserId) ? advertiserId : numAdvertiserId,
        name: 'Radar de Ofertas Auto',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const item = Array.isArray(data) ? data[0] : data;
      const link =
        item?.short_link ||
        item?.deep_link ||
        item?.deep_link_url ||
        item?.link_url ||
        item?.url ||
        item?.shortLink;
      if (link && typeof link === 'string' && link.startsWith('http')) {
        return link;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Converte a URL no link de afiliado oficial
 * Se a conversão ou o rastreamento não puder ser confirmado com a conta oficial,
 * retorna verificationStatus: 'nao_verificado' e isAutoDispatchAllowed: false
 * para bloquear o envio automático e manter a oferta em revisão manual.
 */
export async function convertToAffiliateLink(
  rawUrl: string,
  credentials: Record<StoreName, StoreCredential | null>
): Promise<ConvertAffiliateResult> {
  // 1. Resolução segura de redirecionamento
  const resolved = await resolveUrlSafely(rawUrl);

  if (resolved.error) {
    return {
      success: false,
      store: resolved.store,
      originalUrl: rawUrl,
      cleanUrl: rawUrl,
      affiliateUrl: null,
      verificationStatus: 'rejeitado',
      isAutoDispatchAllowed: false,
      linkState: 'gerado',
      error: `Erro ao resolver link: ${resolved.error}`,
    };
  }

  const store = resolved.store || detectStoreFromUrl(resolved.finalUrl);
  if (!store) {
    return {
      success: false,
      store: null,
      originalUrl: rawUrl,
      cleanUrl: resolved.finalUrl,
      affiliateUrl: null,
      verificationStatus: 'rejeitado',
      isAutoDispatchAllowed: false,
      linkState: 'gerado',
      error: 'Loja não suportada ou domínio não reconhecido.',
    };
  }

  const storeCreds = credentials[store];
  if (!storeCreds || !storeCreds.isActive || (!storeCreds.affiliateTag && !storeCreds.appId)) {
    return {
      success: false,
      store,
      originalUrl: rawUrl,
      cleanUrl: resolved.finalUrl,
      affiliateUrl: null,
      verificationStatus: 'rejeitado',
      isAutoDispatchAllowed: false,
      linkState: 'gerado',
      error: `Credenciais de afiliado não configuradas ou inativas para ${store.toUpperCase()}.`,
    };
  }

  // Não aceitar identificadores de teste ou exemplo
  if (isDummyOrExampleId(storeCreds.affiliateTag) || isDummyOrExampleId(storeCreds.appId)) {
    return {
      success: false,
      store,
      originalUrl: rawUrl,
      cleanUrl: resolved.finalUrl,
      affiliateUrl: null,
      verificationStatus: 'rejeitado',
      isAutoDispatchAllowed: false,
      linkState: 'gerado',
      error: `Identificadores de teste ou exemplo detectados para ${store.toUpperCase()}. Configure identificadores reais da sua conta.`,
    };
  }

  const cleanUrl = sanitizeStoreUrl(resolved.finalUrl, store);
  const productId = extractProductId(cleanUrl, store);

  let generatedAffiliateUrl: string | null = null;
  let verificationStatus: AffiliateVerificationStatus = 'nao_verificado';
  let isAutoDispatchAllowed = false;
  let verificationReason = 'Aguardando validação com a conta oficial';
  const isPriorIntegrationTested = Boolean(storeCreds.isValidated);
  let extractedImageUrl: string | undefined = resolved.extractedImageUrl;

  try {
    if (store === 'mercadolivre') {
      const tag = storeCreds.affiliateTag?.trim();
      const toolId = storeCreds.appId?.trim();
      if (!tag) {
        throw new Error('Credenciais do Mercado Livre incompletas (affiliateTag/matt_word é obrigatório).');
      }

      const u = new URL(cleanUrl);
      if (toolId) {
        u.searchParams.set('matt_tool', toolId);
      }
      u.searchParams.set('matt_word', tag);
      generatedAffiliateUrl = u.toString();

      // REGRA ESTRITA: Presença de token ou isValidated de teste anterior NÃO confirmam o link do produto.
      // O Mercado Livre Afiliados não oferece endpoint de API pública em tempo real para confirmação de links individuais.
      // Portanto, o link é classificado como "link montado" ('gerado'), mantido em revisão manual e NUNCA apto para auto-dispatch.
      verificationStatus = 'nao_verificado';
      isAutoDispatchAllowed = false;
      verificationReason =
        'Parâmetros oficiais matt_tool e matt_word aplicados (link montado). O Mercado Livre Afiliados não disponibiliza API pública em tempo real para confirmação de links individuais; oferta mantida em revisão manual com a limitação declarada.';
    } else if (store === 'shopee') {
      const subId = storeCreds.affiliateTag?.trim();
      const hasApiCreds = Boolean(storeCreds.appId && storeCreds.appSecret && storeCreds.appSecret.trim().length > 10);

      if (!subId && !storeCreds.appId) {
        throw new Error('Identificador de afiliado (sub_id / tracking) da Shopee não configurado.');
      }

      if (hasApiCreds) {
        // Tenta gerar short link oficial caso App ID e App Secret estejam configurados
        const shortLinkResult = await tryGenerateShopeeShortLink(
          cleanUrl,
          storeCreds.appId!.trim(),
          storeCreds.appSecret!.trim(),
          subId ? [subId] : []
        );

        if (shortLinkResult) {
          generatedAffiliateUrl = shortLinkResult;
          verificationStatus = 'verificado';
          isAutoDispatchAllowed = true;
          verificationReason = 'Link curto oficial gerado e confirmado via Shopee Open API GraphQL.';
          if (!extractedImageUrl && productId && productId.includes('.')) {
            const itemId = productId.split('.')[1];
            if (itemId) {
              extractedImageUrl = await fetchShopeeProductImageByItemId(
                itemId,
                storeCreds.appId!.trim(),
                storeCreds.appSecret!.trim()
              );
            }
          }
        } else {
          // A API falhou explicitamente
          return {
            success: false,
            store,
            originalUrl: rawUrl,
            cleanUrl,
            affiliateUrl: null,
            verificationStatus: 'rejeitado',
            isAutoDispatchAllowed: false,
            linkState: 'gerado',
            error:
              'Falha ao gerar link via Shopee Open API: a API não retornou confirmação de rastreamento. Oferta não pode ser convertida com segurança.',
          };
        }
      } else {
        // Sem API GraphQL, apenas parâmetro manual -> REVISÃO MANUAL
        const u = new URL(cleanUrl);
        if (subId) u.searchParams.set('sub_id', subId);
        generatedAffiliateUrl = u.toString();

        verificationStatus = 'nao_verificado';
        isAutoDispatchAllowed = false;
        verificationReason =
          'Parâmetro sub_id aplicado manualmente. Sem credenciais de API Open GraphQL para validação em tempo real; oferta mantida em revisão manual.';
      }
    } else if (store === 'netshoes') {
      const siteId = storeCreds.affiliateTag?.trim();
      const merchantId = storeCreds.appId?.trim();
      const token = storeCreds.userToken?.trim();

      if (!siteId || !merchantId) {
        throw new Error('Credenciais da Netshoes incompletas (Rakuten Site ID e Merchant ID são obrigatórios).');
      }

      if (token && token.length > 15) {
        // Testar via Rakuten Deep Links API oficial
        const deepLinkResult = await tryGenerateRakutenDeepLink(cleanUrl, merchantId, token);
        if (deepLinkResult) {
          generatedAffiliateUrl = deepLinkResult;
          verificationStatus = 'verificado';
          isAutoDispatchAllowed = true;
          verificationReason = 'Deep link oficial gerado e autenticado via Rakuten Advertising Deep Links API.';
        } else {
          // Fallback montado com aviso explícito
          generatedAffiliateUrl = `https://click.linksynergy.com/deeplink?id=${encodeURIComponent(siteId)}&mid=${encodeURIComponent(merchantId)}&murl=${encodeURIComponent(cleanUrl)}`;
          verificationStatus = 'nao_verificado';
          isAutoDispatchAllowed = false;
          verificationReason =
            'Deep Link Rakuten montado localmente. A API Rakuten não confirmou a geração deste link específico; mantido em revisão manual.';
        }
      } else {
        // Apenas montado
        generatedAffiliateUrl = `https://click.linksynergy.com/deeplink?id=${encodeURIComponent(siteId)}&mid=${encodeURIComponent(merchantId)}&murl=${encodeURIComponent(cleanUrl)}`;
        verificationStatus = 'nao_verificado';
        isAutoDispatchAllowed = false;
        verificationReason =
          'Deep link Rakuten/Netshoes montado. Sem token Bearer da Deep Links API para confirmação instantânea; envio exige revisão manual.';
      }
    } else if (store === 'magalu') {
      const tag = storeCreds.affiliateTag?.trim();
      if (!tag) throw new Error('ID de afiliado do Magazine Luiza não configurado.');
      generatedAffiliateUrl = `https://www.magazinevoce.com.br/${encodeURIComponent(tag)}/p/${productId || ''}`;
      verificationStatus = 'nao_verificado';
      isAutoDispatchAllowed = false;
      verificationReason = 'Vitrine Magazine Você montada. Oferta requer revisão manual antes do envio.';
    } else if (store === 'amazon') {
      const tag = storeCreds.affiliateTag?.trim();
      if (!tag) throw new Error('Tag de associado Amazon não configurada.');
      const u = new URL(cleanUrl);
      u.searchParams.set('tag', tag);
      generatedAffiliateUrl = u.toString();
      verificationStatus = 'nao_verificado';
      isAutoDispatchAllowed = false;
      verificationReason = 'Tag de associado Amazon aplicada na URL. Exige revisão manual.';
    } else if (store === 'aliexpress') {
      const tag = storeCreds.affiliateTag?.trim();
      if (!tag) throw new Error('Tracking ID do AliExpress não configurado.');
      const u = new URL(cleanUrl);
      u.searchParams.set('aff_platform', 'portals-tool');
      u.searchParams.set('sk', tag);
      generatedAffiliateUrl = u.toString();
      verificationStatus = 'nao_verificado';
      isAutoDispatchAllowed = false;
      verificationReason = 'Tracking ID do AliExpress aplicado. Exige revisão manual.';
    }

    if (!generatedAffiliateUrl) {
      throw new Error(`Não foi possível gerar link para a loja ${store.toUpperCase()}.`);
    }

    // REGRA ESTRITA DE ESTADO DE LINK:
    // - "apto_para_envio": APENAS links confirmados por API/sessão em tempo real (isAutoDispatchAllowed === true)
    // - "gerado": links montados por parâmetro que exigem revisão manual humana
    const linkState: LinkState = isAutoDispatchAllowed ? 'apto_para_envio' : 'gerado';

    return {
      success: true,
      store,
      originalUrl: rawUrl,
      cleanUrl,
      affiliateUrl: generatedAffiliateUrl,
      verificationStatus,
      isAutoDispatchAllowed,
      linkState,
      meta: {
        productId: productId || undefined,
        affiliateTagUsed: storeCreds.affiliateTag,
        appIdUsed: storeCreds.appId,
        verificationReason,
        integrationTested: isPriorIntegrationTested,
        extractedImageUrl,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      store,
      originalUrl: rawUrl,
      cleanUrl,
      affiliateUrl: null,
      verificationStatus: 'rejeitado',
      isAutoDispatchAllowed: false,
      linkState: 'gerado',
      error: msg,
    };
  }
}
