import { NextRequest, NextResponse } from 'next/server';
import {
  readDatabase,
  savePublicationJob,
  ensureValidUuid,
  isValidGatewayUrl,
  getActiveEvolutionConfig,
} from '@/lib/server/storage';
import { processRadarArt } from '@/lib/server/radar-art-engine';
import { convertToAffiliateLink } from '@/lib/server/affiliate-converter';
import { getStoreCredentialsMapWithSecrets } from '@/lib/server/credentials-vault';
import { getSessionFromRequest } from '@/lib/server/auth';
import { buildWhatsAppMessage } from '@/lib/server/message-builder';
import { PublicationJob, StoreCredential, StoreName } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    // 1. AUTENTICAÇÃO OBRIGATÓRIA DE ADMINISTRADOR
    const session = getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Acesso não autorizado. Apenas administradores autenticados podem testar disparos de mensagens.',
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const db = readDatabase();

    // 2. IDENTIFICAR O GRUPO DE TESTE (HOMOLOGAÇÃO OFICIAL)
    // O envio de teste é restrito ao grupo de homologação com permissão confirmada.
    const homologationGroup = (db.groups || []).find((g) => g.isTestGroup);
    if (!homologationGroup) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Nenhum grupo de homologação configurado no sistema. Defina o grupo oficial de teste com permissão confirmada antes de prosseguir.',
        },
        { status: 400 }
      );
    }

    if (body.groupJid && body.groupJid !== homologationGroup.groupJid) {
      return NextResponse.json(
        {
          ok: false,
          error: `O grupo informado (${body.groupJid}) não é o grupo de homologação selecionado (${homologationGroup.name} - ${homologationGroup.groupJid}). O envio de teste é estritamente restrito ao grupo homologado.`,
        },
        { status: 400 }
      );
    }

    const targetGroup = homologationGroup;

    // 3. EXIGIR PERMISSÃO DE POSTAGEM VERIFICADA NO GRUPO DE HOMOLOGAÇÃO
    const isPermissionVerified =
      targetGroup.canPost === true &&
      (targetGroup.permissionStatus === 'verified_admin' || targetGroup.permissionStatus === 'verified_member');

    if (!isPermissionVerified) {
      return NextResponse.json(
        {
          ok: false,
          error: `O grupo de homologação "${targetGroup.name}" não possui permissão confirmada de envio (status: ${targetGroup.permissionStatus || 'não verificado'}). Grupos de homologação exigem permissão verificada no WhatsApp.`,
        },
        { status: 400 }
      );
    }

    // 4. PREPARAR DADOS DA OFERTA REAL (SEM DADOS FICTÍCIOS DE DEMONSTRAÇÃO)
    let offerTitle = typeof body.title === 'string' ? body.title.trim() : undefined;
    let offerOriginalPrice = body.originalPrice !== undefined ? Number(body.originalPrice) : undefined;
    let offerCurrentPrice = body.currentPrice !== undefined ? Number(body.currentPrice) : undefined;
    let offerDiscountPct = body.discountPct !== undefined ? Number(body.discountPct) : undefined;
    let offerUrl = typeof body.url === 'string' ? body.url.trim() : undefined;
    let offerCoupon = typeof body.coupon === 'string' && body.coupon.trim() ? body.coupon.trim() : undefined;
    let offerImageUrl = typeof body.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : undefined;

    if (body.messageId) {
      const incMsg = (db.incomingMessages || []).find((m) => m.id === body.messageId);
      if (incMsg) {
        if (!offerUrl && incMsg.extractedUrls && incMsg.extractedUrls.length > 0) {
          offerUrl = incMsg.extractedUrls[0].trim();
        }
        const prod = (db.products || []).find((p) => p.productUrl === offerUrl || p.affiliateUrl === offerUrl);
        if (prod) {
          if (!offerTitle) offerTitle = prod.title?.trim();
          if (offerCurrentPrice === undefined) offerCurrentPrice = prod.currentPrice;
          if (offerOriginalPrice === undefined) offerOriginalPrice = prod.originalPrice;
          if (offerDiscountPct === undefined) offerDiscountPct = prod.discountPct;
          if (!offerImageUrl) offerImageUrl = prod.imageUrl;
        } else if (!offerTitle) {
          offerTitle = (incMsg.cleanText || incMsg.rawText || '').substring(0, 100).trim();
        }
      }
    } else if (body.productId) {
      const prod = (db.products || []).find((p) => p.id === body.productId);
      if (prod) {
        if (!offerTitle) offerTitle = prod.title?.trim();
        if (offerCurrentPrice === undefined) offerCurrentPrice = prod.currentPrice;
        if (offerOriginalPrice === undefined) offerOriginalPrice = prod.originalPrice;
        if (offerDiscountPct === undefined) offerDiscountPct = prod.discountPct;
        if (!offerUrl) offerUrl = prod.productUrl?.trim();
        if (!offerImageUrl) offerImageUrl = prod.imageUrl;
      }
    }

    // Validação estrita: eliminar dados fictícios e exigir dados reais suficientes
    const missingFields: string[] = [];
    if (!offerUrl) missingFields.push('URL da oferta (link do produto)');
    if (!offerTitle) missingFields.push('Título do produto');
    if (offerCurrentPrice === undefined || isNaN(offerCurrentPrice) || offerCurrentPrice <= 0) {
      missingFields.push('Preço atual do produto (deve ser um valor numérico positivo)');
    }

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Oferta com dados insuficientes para processamento. Campos faltantes: ${missingFields.join(
            ', '
          )}. O sistema não utiliza dados fictícios. Forneça uma oferta real válida ou selecione uma mensagem recebida.`,
          missingFields,
        },
        { status: 400 }
      );
    }

    const realProduct = {
      title: offerTitle as string,
      originalPrice: offerOriginalPrice,
      currentPrice: offerCurrentPrice as number,
      discountPct: offerDiscountPct,
      rawUrl: offerUrl as string,
      coupon: offerCoupon,
    };

    // 5. Converter link de afiliado (incluindo segredos descriptografados do cofre)
    const credentialsMap = await getStoreCredentialsMapWithSecrets(session.userId, db.stores);
    const convResult = await convertToAffiliateLink(realProduct.rawUrl, credentialsMap);
    
    // NENHUMA OFERTA PODE SER PUBLICADA COM O LINK ORIGINAL DE ORIGEM
    if (!convResult.affiliateUrl || convResult.verificationStatus === 'rejeitado') {
      return NextResponse.json(
        {
          ok: false,
          error: `Falha na conversão para a sua conta de afiliado: ${convResult.error || 'Não foi possível gerar um link com sua tag/integração'}. Nenhuma oferta pode ser publicada com o link do grupo de origem.`,
          linkState: convResult.linkState,
          store: convResult.store,
        },
        { status: 400 }
      );
    }
    const finalAffiliateUrl = convResult.affiliateUrl;

    // 6. Gerar Arte Radar Automática 1:1 Oficial (sem imagens fictícias)
    const artResult = await processRadarArt({
      productTitle: realProduct.title,
      storeName: convResult.store || 'mercadolivre',
      imageUrl: offerImageUrl,
      currentPrice: realProduct.currentPrice,
      originalPrice: realProduct.originalPrice,
      discountPct: realProduct.discountPct,
      isPriceVerified: true,
      isDiscountVerified: Boolean(realProduct.discountPct && realProduct.discountPct > 0),
      fallbackRule: offerImageUrl ? 'revisao_manual' : 'text_only',
    });

    // 7. Montar texto formatado utilizando o template do usuário
    const messageText = buildWhatsAppMessage({
      templateText: body.templateText,
      title: realProduct.title,
      originalPrice: realProduct.originalPrice,
      currentPrice: realProduct.currentPrice,
      discountPct: realProduct.discountPct,
      affiliateUrl: finalAffiliateUrl,
      couponCode: realProduct.coupon,
      watermarkText: db.settings?.watermarkText || '🎯 *Radar de Ofertas* — Os melhores achadinhos',
    });

    // 8. MODO PRÉVIA SEM ENVIO (PREVIEW ONLY)
    // Retorna a prévia sem salvar nenhum trabalho de envio no banco e sem chamar a Evolution API
    if (body.previewOnly === true || body.action === 'preview') {
      return NextResponse.json({
        ok: true,
        previewOnly: true,
        store: convResult.store,
        productTitle: realProduct.title,
        targetGroup: {
          jid: targetGroup.groupJid,
          name: targetGroup.name,
          canPost: targetGroup.canPost,
          isAdmin: targetGroup.isAdmin,
          roleDescription: targetGroup.roleDescription,
          permissionStatus: targetGroup.permissionStatus,
        },
        previewMessage: messageText,
        artGenerated: {
          artUrl: artResult.artUrl,
          audit: artResult.audit,
        },
        affiliateUrl: finalAffiliateUrl,
        linkState: convResult.linkState,
        verificationStatus: convResult.verificationStatus,
        isAutoDispatchAllowed: convResult.isAutoDispatchAllowed,
        canDispatch: convResult.linkState === 'apto_para_envio',
        message:
          convResult.linkState === 'apto_para_envio'
            ? 'Prévia gerada com sucesso! O link está apto para envio de teste no grupo de homologação.'
            : `Prévia gerada com sucesso (link em estado "${convResult.linkState}"). O botão de envio real permanecerá desabilitado porque a plataforma não fornece confirmação de link individual por API em tempo real.`,
      });
    }

    // 9. ENVIO REAL DE HOMOLOGAÇÃO: Exige confirmação explícita E link em estado 'apto_para_envio'
    if (!body.confirmed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Confirmação obrigatória: é necessário confirmar o envio explicitamente antes de disparar.',
          requiresConfirmation: true,
        },
        { status: 400 }
      );
    }

    // REGRA ESTRITA: A confirmação do botão, sozinha, NÃO BASTA.
    // O link deve estar em estado 'apto_para_envio'. Se for apenas link montado ('gerado'), o envio real é bloqueado.
    if (convResult.linkState !== 'apto_para_envio') {
      return NextResponse.json(
        {
          ok: false,
          error: `Envio de teste bloqueado: o link está em estado "${convResult.linkState}". Para disparo real ao WhatsApp, o link deve estar em estado "apto_para_envio" com confirmação oficial da plataforma para sua conta. Motivo: ${convResult.meta?.verificationReason || 'Plataforma não oferece validação por API em tempo real'}.`,
          linkState: convResult.linkState,
          verificationStatus: convResult.verificationStatus,
          isAutoDispatchAllowed: convResult.isAutoDispatchAllowed,
        },
        { status: 400 }
      );
    }

    // Cria trabalho com status 'enviando' (nunca 'agendado', para evitar envio posterior inesperado)
    const testJob: PublicationJob = {
      id: ensureValidUuid(),
      userId: db.settings.userId || '00000000-0000-0000-0000-000000000001',
      originType: 'copiador',
      targetJid: targetGroup.groupJid,
      targetName: targetGroup.name,
      messageText,
      mediaUrl: artResult.artUrl,
      mediaType: 'image',
      affiliateUrl: finalAffiliateUrl,
      status: 'enviando',
      scheduledFor: new Date().toISOString(),
      attempts: 1,
      maxAttempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const config = getActiveEvolutionConfig(db.whatsapp);
    let dispatchSuccess = false;
    let dispatchError: string | undefined;

    if (config.baseUrl && config.apiKey && config.instanceName && db.whatsapp.status === 'connected') {
      const urlCheck = isValidGatewayUrl(config.baseUrl);
      if (urlCheck.valid) {
        try {
          const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');
          const endpoint = testJob.mediaUrl
            ? `${cleanBaseUrl}/message/sendMedia/${encodeURIComponent(config.instanceName)}`
            : `${cleanBaseUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`;

          const payload = testJob.mediaUrl
            ? {
                number: testJob.targetJid,
                mediatype: 'image',
                media: testJob.mediaUrl,
                caption: testJob.messageText,
              }
            : {
                number: testJob.targetJid,
                text: testJob.messageText,
              };

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: config.apiKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (res.ok) {
            dispatchSuccess = true;
            testJob.status = 'enviado';
            testJob.sentAt = new Date().toISOString();
          } else {
            const errBody = await res.text().catch(() => '');
            dispatchError = `Gateway retornou erro HTTP ${res.status}: ${errBody.substring(0, 100)}`;
            testJob.status = 'falha';
            testJob.errorDetails = dispatchError;
          }
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          dispatchError = `Falha de rede ao disparar no WhatsApp: ${msg}`;
          testJob.status = 'falha';
          testJob.errorDetails = dispatchError;
        }
      } else {
        testJob.status = 'falha';
        dispatchError = 'URL do gateway inválida ou não segura.';
      }
    } else {
      testJob.status = 'falha';
      dispatchError = 'Instância WhatsApp não conectada ou credenciais ausentes.';
    }

    testJob.updatedAt = new Date().toISOString();
    // Salva o trabalho com status final ('enviado' ou 'falha') — NUNCA 'agendado'
    await savePublicationJob(testJob);

    return NextResponse.json({
      ok: true,
      message: dispatchSuccess
        ? `Mensagem de teste enviada com sucesso para o grupo "${targetGroup.name}"!`
        : `Arte e mensagem preparadas. Falha na entrega ao gateway: ${dispatchError}`,
      targetGroup: {
        jid: targetGroup.groupJid,
        name: targetGroup.name,
      },
      artGenerated: {
        artUrl: artResult.artUrl,
        audit: artResult.audit,
      },
      job: testJob,
      dispatched: dispatchSuccess,
      warning: dispatchSuccess ? undefined : dispatchError,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
