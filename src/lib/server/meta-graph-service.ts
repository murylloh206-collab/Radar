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

export interface PublishMediaResult {
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
 * Conecta e valida a conta da Meta através de um Access Token com detecção inteligente
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

    // 2. Inspecionar o Token via /me para identificar o ID e Nome da entidade (User ou Page)
    const meRes = await fetch(
      `${META_GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`
    );
    const meJson = await meRes.json();

    if (meJson.error) {
      return {
        ok: false,
        error: `A Meta recusou a validação do token: ${meJson.error.message || 'Token inválido ou expirado.'}`,
      };
    }

    // 3. Tentar consultar /me/accounts para listar as Páginas
    const pagesRes = await fetch(
      `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(token)}`
    );
    const pagesJson = await pagesRes.json();

    // Se /me/accounts retornou páginas válidas (fluxo User Token com páginas)
    if (pagesJson.data && Array.isArray(pagesJson.data) && pagesJson.data.length > 0) {
      const pages = pagesJson.data;
      const pageWithIg = pages.find((p: any) => p.instagram_business_account?.id);

      if (!pageWithIg) {
        const pageNames = pages.map((p: any) => p.name).join(', ');
        return {
          ok: false,
          error: `Página(s) encontrada(s): "${pageNames}", porém nenhuma delas possui uma Conta Profissional do Instagram vinculada.\n\nPara resolver: acesse o Meta Business Suite > Configurações > Contas do Instagram e conecte seu perfil comercial à página.`,
        };
      }

      const effectiveToken = pageWithIg.access_token || token;
      const igAccount = pageWithIg.instagram_business_account;

      return await persistMetaCredentials(userId, {
        accessToken: effectiveToken,
        facebookPageId: pageWithIg.id,
        facebookPageName: pageWithIg.name,
        instagramAccountId: igAccount.id,
        instagramUsername: igAccount.username,
        instagramProfilePic: igAccount.profile_picture_url,
      });
    }

    // Se /me/accounts falhou (ex: o token já é um Page Access Token direto)
    // Tentar consultar a entidade /me diretamente como se fosse uma Página
    const directPageRes = await fetch(
      `${META_GRAPH_BASE}/${meJson.id}?fields=id,name,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(token)}`
    );
    const directPageJson = await directPageRes.json();

    if (directPageJson.instagram_business_account?.id) {
      const ig = directPageJson.instagram_business_account;
      return await persistMetaCredentials(userId, {
        accessToken: token,
        facebookPageId: directPageJson.id,
        facebookPageName: directPageJson.name,
        instagramAccountId: ig.id,
        instagramUsername: ig.username,
        instagramProfilePic: ig.profile_picture_url,
      });
    }

    // Se /me/accounts retornou vazio (data: []), investigar as permissões do usuário
    if (pagesJson.data && Array.isArray(pagesJson.data) && pagesJson.data.length === 0) {
      const permRes = await fetch(
        `${META_GRAPH_BASE}/me/permissions?access_token=${encodeURIComponent(token)}`
      );
      const permJson = await permRes.json();
      const grantedPerms = new Set(
        (permJson.data || []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission)
      );

      if (!grantedPerms.has('pages_show_list')) {
        return {
          ok: false,
          error:
            "O token foi gerado sem a permissão 'pages_show_list'.\n\nComo resolver no Graph API Explorer:\n1. No topo direito, no campo 'User or Page', selecione a sua Página do Facebook diretamente;\n2. OU clique em 'Add a Permission' e adicione 'pages_show_list', 'instagram_basic', 'instagram_content_publish' e gere o token novamente.",
        };
      }

      return {
        ok: false,
        error: `O perfil "${meJson.name || 'informado'}" não possui nenhuma Página do Facebook como administrador. Crie uma Página no Facebook e vincule seu Instagram Comercial a ela.`,
      };
    }

    // Se chegou até aqui sem encontrar o Instagram
    if (directPageJson.name) {
      return {
        ok: false,
        error: `Página "${directPageJson.name}" conectada, mas ela não possui uma Conta Comercial do Instagram vinculada.\n\nNo Meta Business Suite, vincule seu Instagram Comercial à sua página para liberar a publicação.`,
      };
    }

    return {
      ok: false,
      error: `A Meta não localizou páginas nem Instagram vinculados ao token informado: ${pagesJson.error?.message || 'Permissões insuficientes.'}`,
    };
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
): Promise<PublishMediaResult> {
  return publishToInstagramMedia(userId, {
    imageUrl: params.imageUrl,
    mediaType: 'STORIES',
    caption: params.caption,
  });
}

/**
 * Publica um Post no FEED do Instagram através da Meta Graph API
 */
export async function publishFeedPostToInstagram(
  userId: string,
  params: {
    imageUrl: string;
    caption: string;
  }
): Promise<PublishMediaResult> {
  return publishToInstagramMedia(userId, {
    imageUrl: params.imageUrl,
    caption: params.caption,
  });
}

/**
 * Publica uma Foto com Texto no Feed da Página do Facebook
 */
export async function publishFeedPostToFacebook(
  userId: string,
  params: {
    imageUrl: string;
    caption: string;
  }
): Promise<PublishMediaResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: 'Banco de dados não configurado.' };
  }

  const { data: record, error } = await supabase
    .from('store_credentials_vault')
    .select('*')
    .eq('user_id', userId)
    .eq('store_name', 'meta')
    .maybeSingle();

  if (error || !record || !record.is_active || record.connection_status !== 'conectado') {
    return { ok: false, error: 'Nenhuma conta da Meta conectada.' };
  }

  const token = record.encrypted_user_token ? decryptSecret(record.encrypted_user_token) : null;
  const pageId = record.app_id;

  if (!token || !pageId) {
    return { ok: false, error: 'Página do Facebook não configurada no cofre.' };
  }

  try {
    const postUrl = new URL(`${META_GRAPH_BASE}/${pageId}/photos`);
    postUrl.searchParams.set('url', params.imageUrl);
    postUrl.searchParams.set('message', params.caption);
    postUrl.searchParams.set('access_token', token);

    const res = await fetch(postUrl.toString(), { method: 'POST' });
    const json = await res.json();

    if (json.error) {
      return { ok: false, error: `Erro da Meta ao publicar no Facebook: ${json.error.message}` };
    }

    return {
      ok: true,
      mediaId: json.id || json.post_id,
      publishedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return { ok: false, error: `Falha ao publicar no Facebook: ${err.message}` };
  }
}

/**
 * Função interna reutilizável para criação e publicação de mídias no Instagram
 */
async function publishToInstagramMedia(
  userId: string,
  params: {
    imageUrl: string;
    mediaType?: 'STORIES' | 'IMAGE';
    caption?: string;
  }
): Promise<PublishMediaResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: 'Banco de dados não configurado.' };
  }

  const { data: record, error } = await supabase
    .from('store_credentials_vault')
    .select('*')
    .eq('user_id', userId)
    .eq('store_name', 'meta')
    .maybeSingle();

  if (error || !record || !record.is_active || record.connection_status !== 'conectado') {
    return { ok: false, error: 'Nenhuma conta do Instagram conectada. Conecte sua conta em Conexões > Redes Sociais.' };
  }

  const token = record.encrypted_user_token ? decryptSecret(record.encrypted_user_token) : null;
  const igUserId = record.tag_identified;

  if (!token || !igUserId) {
    return { ok: false, error: 'Credenciais da Meta incompletas ou corrompidas no cofre.' };
  }

  try {
    // 1. Criar container de mídia
    const containerUrl = new URL(`${META_GRAPH_BASE}/${igUserId}/media`);
    containerUrl.searchParams.set('image_url', params.imageUrl);
    if (params.mediaType === 'STORIES') {
      containerUrl.searchParams.set('media_type', 'STORIES');
    }
    if (params.caption) {
      containerUrl.searchParams.set('caption', params.caption);
    }
    containerUrl.searchParams.set('access_token', token);

    const createRes = await fetch(containerUrl.toString(), {
      method: 'POST',
    });
    const createJson = await createRes.json();

    if (createJson.error) {
      return {
        ok: false,
        error: `Erro da Meta ao preparar a publicação: ${createJson.error.message || 'Falha no container de mídia'}`,
      };
    }

    const creationId = createJson.id;
    if (!creationId) {
      return { ok: false, error: 'A Meta não retornou o identificador da publicação.' };
    }

    // 2. Intervalo de segurança para CDN da Meta processar a imagem
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 3. Publicar o container
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
        error: `Erro da Meta ao publicar: ${publishJson.error.message || 'Falha na publicação'}`,
      };
    }

    return {
      ok: true,
      creationId,
      mediaId: publishJson.id,
      publishedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Erro ao comunicar com a API do Instagram: ${err.message || 'Falha de conexão com a Meta'}`,
    };
  }
}
