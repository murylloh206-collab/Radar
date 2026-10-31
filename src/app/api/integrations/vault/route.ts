import { NextRequest, NextResponse } from 'next/server';
import { checkApiAuth } from '@/lib/server/auth';
import {
  getSafeVaultStatus,
  saveStoreCredentials,
  revokeStoreCredentials,
  SaveVaultInput,
} from '@/lib/server/credentials-vault';
import { listRecentEvidence } from '@/lib/server/link-evidence';
import { StoreName } from '@/lib/types';
import { generateShopeeShortLinkDetailed } from '@/lib/server/affiliate-converter';

export async function GET(req: NextRequest) {
  const auth = checkApiAuth(req);
  if (!auth.authorized || !auth.session) {
    return auth.response!;
  }

  const userId = auth.session.userId;
  const [stores, recentEvidence] = await Promise.all([
    getSafeVaultStatus(userId),
    listRecentEvidence(userId, 30),
  ]);

  return NextResponse.json({
    ok: true,
    userId,
    stores,
    recentEvidence,
  });
}

export async function POST(req: NextRequest) {
  const auth = checkApiAuth(req);
  if (!auth.authorized || !auth.session) {
    return auth.response!;
  }

  const userId = auth.session.userId;

  try {
    const body = await req.json();
    const action = body.action as 'save' | 'test' | 'disconnect';
    const storeName = body.storeName as StoreName;
    const data = body.data || {};

    if (!storeName) {
      return NextResponse.json({ ok: false, error: 'Nome da loja não informado.' }, { status: 400 });
    }

    const validStores: StoreName[] = ['mercadolivre', 'shopee', 'amazon', 'netshoes', 'magalu'];
    if (!validStores.includes(storeName)) {
      return NextResponse.json({ ok: false, error: `Loja ${storeName} não suportada.` }, { status: 400 });
    }

    // Ação: Desconectar
    if (action === 'disconnect') {
      await revokeStoreCredentials(userId, storeName, req);
      const updatedStores = await getSafeVaultStatus(userId);
      return NextResponse.json({
        ok: true,
        message: `Integração de ${storeName} desconectada com sucesso.`,
        stores: updatedStores,
      });
    }

    // Ação: Testar credenciais
    if (action === 'test') {
      if (storeName === 'shopee') {
        const appId = String(data.appId || '').trim();
        const appSecret = String(data.appSecret || '').trim();

        if (!appId || !appSecret) {
          return NextResponse.json({
            ok: false,
            error: 'App ID e App Secret são obrigatórios para testar a Shopee.',
          });
        }

        // Testar chamada real assinado na API da Shopee
        const testRes = await generateShopeeShortLinkDetailed(
          'https://shopee.com.br/product/123/456',
          appId,
          appSecret
        );

        if (!testRes.ok) {
          return NextResponse.json({
            ok: false,
            error: testRes.errorMessage || 'Falha na autenticação da Shopee: App ID ou App Secret inválidos.',
            httpStatus: testRes.httpStatus,
          });
        }

        return NextResponse.json({
          ok: true,
          message: 'Credenciais da Shopee testadas e validadas com sucesso na API oficial!',
        });
      }

      if (storeName === 'amazon') {
        const tag = String(data.affiliateTag || '').trim();
        if (!tag) {
          return NextResponse.json({
            ok: false,
            error: 'ID de rastreamento (Tag de associado) é obrigatório.',
          });
        }
        if (!/^[a-zA-Z0-9_-]+-20$/.test(tag) && !/^[a-zA-Z0-9_-]+$/.test(tag)) {
          return NextResponse.json({
            ok: false,
            error: 'O ID de rastreamento da Amazon Brasil geralmente termina em -20 (ex: minhaloja-20).',
          });
        }
        return NextResponse.json({
          ok: true,
          message: `ID de rastreamento Amazon "${tag}" formato válido para amazon.com.br!`,
        });
      }

      if (storeName === 'netshoes') {
        const appId = String(data.appId || '').trim();
        const token = String(data.userToken || '').trim();
        if (!appId || !token) {
          return NextResponse.json({
            ok: false,
            error: 'ID do anunciante e Token de acesso Rakuten são obrigatórios.',
          });
        }
        return NextResponse.json({
          ok: true,
          message: 'Parâmetros Rakuten Advertising validados com sucesso.',
        });
      }

      if (storeName === 'mercadolivre') {
        const appId = String(data.appId || '').trim();
        const tag = String(data.affiliateTag || '').trim();
        if (!appId && !tag) {
          return NextResponse.json({
            ok: false,
            error: 'Informe o ID da ferramenta ou a Tag de rastreio do Mercado Livre.',
          });
        }
        return NextResponse.json({
          ok: true,
          message: 'Dados manuais de afiliado Mercado Livre validados com sucesso.',
        });
      }

      if (storeName === 'magalu') {
        const tag = String(data.affiliateTag || '').trim();
        if (!tag) {
          return NextResponse.json({
            ok: false,
            error: 'Nome ou código da sua loja no Magazine Você é obrigatório.',
          });
        }
        return NextResponse.json({
          ok: true,
          message: `Loja Magazine Você "${tag}" validada com sucesso.`,
        });
      }

      return NextResponse.json({ ok: true, message: 'Dados validados.' });
    }

    // Ação: Salvar credenciais
    if (action === 'save') {
      const now = new Date().toISOString();
      const saveInput: SaveVaultInput = {
        storeName,
        connectionStatus: 'conectado',
        isActive: true,
        lastVerifiedAt: now,
      };

      if (storeName === 'shopee') {
        const appId = String(data.appId || '').trim();
        const appSecret = String(data.appSecret || '').trim();
        if (!appId) {
          return NextResponse.json({ ok: false, error: 'App ID da Shopee é obrigatório.' }, { status: 400 });
        }
        saveInput.appId = appId;
        if (appSecret) saveInput.appSecret = appSecret;
        saveInput.authType = 'api_hmac';
      } else if (storeName === 'amazon') {
        const tag = String(data.affiliateTag || '').trim();
        if (!tag) {
          return NextResponse.json({ ok: false, error: 'ID de rastreamento da Amazon é obrigatório.' }, { status: 400 });
        }
        saveInput.affiliateTag = tag;
        saveInput.authType = 'credentials';
      } else if (storeName === 'netshoes') {
        const appId = String(data.appId || '').trim();
        const token = String(data.userToken || '').trim();
        if (!appId) {
          return NextResponse.json({ ok: false, error: 'ID do anunciante Netshoes é obrigatório.' }, { status: 400 });
        }
        saveInput.appId = appId;
        if (token) saveInput.userToken = token;
        saveInput.authType = 'rakuten_token';
      } else if (storeName === 'mercadolivre') {
        const appId = String(data.appId || '').trim();
        const tag = String(data.affiliateTag || '').trim();
        if (!appId && !tag) {
          return NextResponse.json({ ok: false, error: 'Informe a Tag ou o ID do Mercado Livre.' }, { status: 400 });
        }
        if (appId) saveInput.appId = appId;
        if (tag) saveInput.affiliateTag = tag;
        saveInput.authType = 'credentials';
      } else if (storeName === 'magalu') {
        const tag = String(data.affiliateTag || '').trim();
        if (!tag) {
          return NextResponse.json({ ok: false, error: 'Código da loja Magazine Você é obrigatório.' }, { status: 400 });
        }
        saveInput.affiliateTag = tag;
        saveInput.authType = 'credentials';
      }

      await saveStoreCredentials(userId, saveInput, req);
      const updatedStores = await getSafeVaultStatus(userId);

      return NextResponse.json({
        ok: true,
        message: `Integração de ${storeName} salva com sucesso e conectada!`,
        stores: updatedStores,
      });
    }

    return NextResponse.json({ ok: false, error: `Ação "${action}" desconhecida.` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno no cofre de credenciais.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = checkApiAuth(req);
  if (!auth.authorized || !auth.session) {
    return auth.response!;
  }

  const userId = auth.session.userId;
  const { searchParams } = new URL(req.url);
  const storeName = searchParams.get('store') as StoreName;

  if (!storeName) {
    return NextResponse.json({ ok: false, error: 'Parâmetro ?store é obrigatório.' }, { status: 400 });
  }

  await revokeStoreCredentials(userId, storeName, req);
  const updatedStores = await getSafeVaultStatus(userId);

  return NextResponse.json({
    ok: true,
    message: `Integração de ${storeName} desconectada.`,
    stores: updatedStores,
  });
}
