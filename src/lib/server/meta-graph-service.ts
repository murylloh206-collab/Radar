import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { encryptSecret, decryptSecret, encryptJson, decryptJson } from './crypto-vault';

export interface MetaIntegrationData {
  isConnected: boolean;
  facebookPageId?: string;
  facebookPageName?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  instagramProfilePic?: string;
  accountType?: 'business' | 'creator';
  connectedAt?: string;
  lastVerifiedAt?: string;
}

export interface PublishStoryResult {
  ok: boolean;
  creationId?: string;
  mediaId?: string;
  publishedAt?: string;
  permalink?: string;
  error?: string;
}

const META_GRAPH_VERSION = 'v19.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Consulta as credenciais e status da integração Meta (Facebook / Instagram)
 */
export async function getMetaIntegration(userId: string): Promise<MetaIntegrationData> {
  if (!isSupabaseConfigured || !supabase) {
    return { isConnected: false };
  }

  const { data, error } = await supabase
    .from('store_credentials_vault')
    .select('*')
    .eq('user_id', userId)
    .eq('store_name', 'meta')
    .maybeSingle();

  if (error || !data || !data.is_active || data.connection_status !== 'conectado') {
    return { isConnected: false };
  }

  let session: Record<string, any> = {};
  if (data.encrypted_session_data) {
    try {
      session = decryptJson(data.encrypted_session_data) || {};
    } catch {
      session = {};
    }
  }

  return {
    isConnected: true,
    facebookPageId: data.app_id || session.facebookPageId,
    facebookPageName: session.facebookPageName,
    instagramAccountId: data.tag_identified || session.instagramAccountId,
    instagramUsername: session.instagramUsername,
    instagramProfilePic: session.instagramProfilePic,
    accountType: session.accountType || 'business',
    connectedAt: data.created_at,
    lastVerifiedAt: data.last_verified_at,
  };
}

/**
 * Conecta e valida a conta da Meta através de um Access Token
 */
export async function connectMetaAccount(userId: string, input: {
  accessToken: string;
  pageId?: string;
  instagramAccountId?: string;
}): Promise<{ ok: boolean; data?: MetaIntegrationData; error?: string }> {
  const token = input.accessToken.trim();
  if (!token) {
    return { ok: false, error: 'Token de acesso da Meta não fornecido.' };
  }

  try {
    // 1. Se o usuário forneceu diretamente o Instagram Account ID, testar diretamente
    if (input.instagramAccountId) {
      const igRes = await fetch(
        `${META_GRAPH_BASE}/${input.instagramAccountId}?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(token)}`
      );
      const igJson = await igRes.json();
      if (igJson.error) {
        return { ok: false, error: `Erro na validação do Instagram: ${igJson.error.message}` };
      }

      return await persistMetaCredentials(userId, {
        accessToken: token,
        facebookPageId: input.pageId || '',
        facebookPageName: 'Página Conectada',
        instagramAccountId: igJson.id,
        instagramUsername: igJson.username,
        instagramProfilePic: igJson.profile_picture_url,
      });
    }

    // 2. Caso contrário, inspecionar as Páginas do Usuário na Meta
    const pagesRes = await fetch(
      `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(token)}`
    );
    const pagesJson = await pagesRes.json();

    if (pagesJson.error) {
      return {
        ok: false,
        error: `A Meta recusou a validação do token: ${pagesJson.error.message || 'Token expirado ou sem permissões necessárias.'}`,
      };
    }

    const pages = Array.isArray(pagesJson.data) ? pagesJson.data : [];
    if (pages.length === 0) {
      return {
        ok: false,
        error: 'Nenhuma Página do Facebook encontrada neste perfil da Meta. Crie ou seja administrador de uma Página com Instagram Comercial vinculado.',
      };
    }

    // Encontrar a página que possui conta do Instagram conectada
    const matchedPage = input.pageId
      ? pages.find((p: any) => p.id === input.pageId) || pages[0]
      : pages.find((p: any) => p.instagram_business_account?.id) || pages[0];

    const igAccount = matchedPage.instagram_business_account;
    if (!igAccount?.id) {
      return {
        ok: false,
        error: `A página "${matchedPage.name}" foi encontrada, mas não possui uma Conta Profissional do Instagram vinculada a ela. Vincule seu Instagram à sua Página do Facebook nos ajustes do Meta Business Suite.`,
      };
    }

    const effectiveToken = matchedPage.access_token || token;

    return await persistMetaCredentials(userId, {
      accessToken: effectiveToken,
      facebookPageId: matchedPage.id,
      facebookPageName: matchedPage.name,
      instagramAccountId: igAccount.id,
      instagramUsername: igAccount.username,
      instagramProfilePic: igAccount.profile_picture_url,
    });
  } catch (err: any) {
    return { ok: false, error: `Falha na conexão com a Meta: ${err.message || 'Erro de rede ou timeout'}` };
  }
}

/**
 * Grava as credenciais criptografadas no cofre do Supabase
 */
async function persistMetaCredentials(
  userId: string,
  info: {
    accessToken: string;
    facebookPageId: string;
    facebookPageName: string;
    instagramAccountId: string;
    instagramUsername: string;
    instagramProfilePic?: string;
  }
): Promise<{ ok: boolean; data?: MetaIntegrationData; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: 'Banco de dados não configurado.' };
  }

  const encryptedToken = encryptSecret(info.accessToken);
  const sessionData = {
    facebookPageId: info.facebookPageId,
    facebookPageName: info.facebookPageName,
    instagramAccountId: info.instagramAccountId,
    instagramUsername: info.instagramUsername,
    instagramProfilePic: info.instagramProfilePic,
    accountType: 'business',
  };
  const encryptedSession = encryptJson(sessionData);

  const payload = {
    user_id: userId,
    store_name: 'meta',
    app_id: info.facebookPageId,
    affiliate_tag: info.instagramUsername,
    encrypted_user_token: encryptedToken,
    encrypted_session_data: encryptedSession,
    authType: 'credentials',
    connection_status: 'conectado',
    tag_identified: info.instagramAccountId,
    is_active: true,
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('store_credentials_vault')
    .upsert(payload, { onConflict: 'user_id,store_name' });

  if (error) {
    return { ok: false, error: `Falha ao salvar no cofre seguro: ${error.message}` };
  }

  return {
    ok: true,
    data: {
      isConnected: true,
      facebookPageId: info.facebookPageId,
      facebookPageName: info.facebookPageName,
      instagramAccountId: info.instagramAccountId,
      instagramUsername: info.instagramUsername,
      instagramProfilePic: info.instagramProfilePic,
      accountType: 'business',
      connectedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
    },
  };
}

/**
 * Desconecta a conta da Meta do usuário
 */
export async function disconnectMetaAccount(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  const { error } = await supabase
    .from('store_credentials_vault')
    .update({
      is_active: false,
      connection_status: 'desconectado',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('store_name', 'meta');

  return !error;
}

/**
 * Publica um Story na conta comercial do Instagram através da Meta Graph API
 */
export async function publishStoryToInstagram(
  userId: string,
  params: {
    imageUrl: string;
    caption?: string;
  }
): Promise<PublishStoryResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: 'Banco de dados não configurado.' };
  }

  // 1. Obter token e ID da conta no cofre
  const { data: record, error } = await supabase
    .from('store_credentials_vault')
    .select('*')
    .eq('user_id', userId)
    .eq('store_name', 'meta')
    .maybeSingle();

  if (error || !record || !record.is_active || record.connection_status !== 'conectado') {
    return { ok: false, error: 'Nenhuma conta do Instagram/Facebook conectada no sistema. Conecte sua conta em Conexões > Redes Sociais.' };
  }

  const token = record.encrypted_user_token ? decryptSecret(record.encrypted_user_token) : null;
  const igUserId = record.tag_identified;

  if (!token || !igUserId) {
    return { ok: false, error: 'Credenciais da Meta incompletas ou corrompidas no cofre.' };
  }

  try {
    // 2. Passo 1 da Meta: Criar container de mídia tipo STORIES
    const containerUrl = new URL(`${META_GRAPH_BASE}/${igUserId}/media`);
    containerUrl.searchParams.set('image_url', params.imageUrl);
    containerUrl.searchParams.set('media_type', 'STORIES');
    containerUrl.searchParams.set('access_token', token);

    const createRes = await fetch(containerUrl.toString(), {
      method: 'POST',
    });
    const createJson = await createRes.json();

    if (createJson.error) {
      return {
        ok: false,
        error: `Erro da Meta ao preparar o Story: ${createJson.error.message || 'Falha no container de mídia'}`,
      };
    }

    const creationId = createJson.id;
    if (!creationId) {
      return { ok: false, error: 'A Meta não retornou o identificador do Story para publicação.' };
    }

    // 3. Pequeno intervalo para o processador de CDN da Meta assimilar a imagem
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // 4. Passo 2 da Meta: Publicar o container criado
    const publishUrl = new URL(`${META_GRAPH_BASE}/${igUserId}/media_publish`);
    publishUrl.searchParams.set('creation_id', creationId);
    publishUrl.searchParams.set('access_token', token);

    const publishRes = await fetch(publishUrl.toString(), {
      method: 'POST',
    });
    const publishJson = await publishRes.json();

    if (publishJson.error) {
      return {
        ok: false,
        creationId,
        error: `Erro da Meta ao publicar o Story: ${publishJson.error.message || 'Falha na publicação'}`,
      };
    }

    const mediaId = publishJson.id;

    return {
      ok: true,
      creationId,
      mediaId,
      publishedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Erro ao comunicar com a API do Instagram: ${err.message || 'Falha de conexão com a Meta'}`,
    };
  }
}
