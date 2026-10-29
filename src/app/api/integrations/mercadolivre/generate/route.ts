import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, isValidUuid } from '@/lib/server/auth';
import { getDecryptedCredentials } from '@/lib/server/credentials-vault';
import { registerLinkEvidence } from '@/lib/server/link-evidence';
import { sanitizeStoreUrl, extractProductId } from '@/lib/server/affiliate-converter';

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session || !session.userId) {
      return NextResponse.json(
        { ok: false, error: 'Autenticação necessária.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const userId = session.userId;
    if (!isValidUuid(userId)) {
      return NextResponse.json(
        { ok: false, error: 'Identificador de usuário inválido.' },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) || {};
    const rawUrl = (body.rawUrl || body.originalUrl || body.assembledUrl || '') as string;
    const shortSecUrl = (body.shortSecUrl || body.officialShortUrl || '') as string;
    const affiliateTag = (body.affiliateTag || '') as string;
    const title = (body.title || '') as string;

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.includes('mercadolivre.com')) {
      return NextResponse.json(
        { ok: false, error: 'URL do Mercado Livre válida é obrigatória.' },
        { status: 400 }
      );
    }

    const cleanUrl = sanitizeStoreUrl(rawUrl, 'mercadolivre');
    const productId = extractProductId(cleanUrl, 'mercadolivre') || undefined;

    // 1. CASO A: O link curto oficial (/sec/...) foi gerado pela plataforma Mercado Livre
    const hasOfficialSecLink = Boolean(
      (shortSecUrl && typeof shortSecUrl === 'string' && shortSecUrl.includes('/sec/')) ||
      rawUrl.includes('/sec/')
    );

    if (hasOfficialSecLink) {
      const finalUrl = (shortSecUrl || rawUrl).trim();

      const evidence = await registerLinkEvidence({
        userId,
        storeName: 'mercadolivre',
        productId,
        productTitle: title || 'Produto Mercado Livre',
        originalUrl: rawUrl,
        cleanUrl,
        finalAffiliateUrl: finalUrl,
        confirmationSource: 'mercadolivre_extension_session',
        verificationStatus: 'verificado',
        isAutoDispatchAllowed: true,
        expiresInHours: 72,
      });

      return NextResponse.json({
        ok: true,
        affiliateUrl: finalUrl,
        cleanUrl,
        evidenceId: evidence.id,
        confirmationSource: evidence.confirmationSource,
        verificationStatus: 'verificado',
        isAutoDispatchAllowed: true,
        generatedAt: evidence.generatedAt,
        message: 'Link curto oficial /sec/ confirmado pela plataforma Mercado Livre!',
      });
    }

    // 2. CASO B: Não há link oficial /sec/; apenas parâmetros montados
    // REGRA ESTRITA: Montar URL com matt_tool/matt_word NÃO comprova geração pelo Mercado Livre.
    // Proibido marcar como verificado ou autorizar envio automático!
    const creds = await getDecryptedCredentials(userId, 'mercadolivre');
    const finalTag = (affiliateTag || creds?.tagIdentified || creds?.affiliateTag || '').trim();
    const toolId = (creds?.appId || '').trim();

    // Se for tag fictícia ou vazia
    if (!finalTag || finalTag === 'radar_user_tag' || finalTag === 'tag_ficticia') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Geração indisponível: Nenhuma tag real configurada e nenhum link curto /sec/ oficial detectado na página. A oferta deve ser revisada manualmente.',
          code: 'MANUAL_REVIEW_REQUIRED',
        },
        { status: 422 }
      );
    }

    // Monta URL parametrizada como fallback mantido em REVISÃO MANUAL
    const u = new URL(cleanUrl);
    if (toolId) u.searchParams.set('matt_tool', toolId);
    u.searchParams.set('matt_word', finalTag);
    const assembledUrl = u.toString();

    const evidence = await registerLinkEvidence({
      userId,
      storeName: 'mercadolivre',
      productId,
      productTitle: title || 'Produto Mercado Livre',
      originalUrl: rawUrl,
      cleanUrl,
      finalAffiliateUrl: assembledUrl,
      confirmationSource: 'parameter_assembled_unverified',
      verificationStatus: 'nao_verificado',
      isAutoDispatchAllowed: false,
      expiresInHours: 72,
    });

    return NextResponse.json({
      ok: true,
      affiliateUrl: assembledUrl,
      cleanUrl,
      evidenceId: evidence.id,
      confirmationSource: 'parameter_assembled_unverified',
      verificationStatus: 'nao_verificado',
      isAutoDispatchAllowed: false,
      message:
        'Link montado com parâmetros de rastreamento. O Mercado Livre não comprovou a geração por API; oferta mantida obrigatoriamente em revisão manual.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
