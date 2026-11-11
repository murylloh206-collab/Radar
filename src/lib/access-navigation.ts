export type PublicResourceKey =
  | 'copiador'
  | 'mensagens'
  | 'identidade'
  | 'cards'
  | 'vitrine'
  | 'metricas'
  | 'busca'
  | 'alertas';

export interface PublicResourceDefinition {
  key: PublicResourceKey;
  name: string;
  description: string;
  planNote: string;
  route: string;
}

export const PUBLIC_RESOURCES: Record<PublicResourceKey, PublicResourceDefinition> = {
  copiador: {
    key: 'copiador',
    name: 'Copiador de ofertas',
    description: 'Grupos de origem, destinos e ritmo de publicação.',
    planNote: 'Acessar recurso',
    route: '/copiador',
  },
  mensagens: {
    key: 'mensagens',
    name: 'Mensagens próprias',
    description: 'Textos e modelos que combinam com seu público.',
    planNote: 'Acessar recurso',
    route: '/criar-conteudo?aba=templates',
  },
  identidade: {
    key: 'identidade',
    name: 'Sua identidade',
    description: 'Sua logo, sua marca d’água e as cores do painel.',
    planNote: 'A partir do Plus',
    route: '/pagina-publica',
  },
  cards: {
    key: 'cards',
    name: 'Feed e stories',
    description: 'Uma oferta em formatos prontos para compartilhar.',
    planNote: 'A partir do Plus',
    route: '/criar-conteudo?aba=story',
  },
  vitrine: {
    key: 'vitrine',
    name: 'Vitrine no link da bio',
    description: 'Um endereço para reunir e divulgar suas ofertas.',
    planNote: 'A partir do Plus',
    route: '/pagina-publica',
  },
  metricas: {
    key: 'metricas',
    name: 'Estatísticas',
    description: 'Acompanhe os dados disponíveis nas suas integrações.',
    planNote: 'Conforme seu plano',
    route: '/estatisticas',
  },
  busca: {
    key: 'busca',
    name: 'Busca e comparação',
    description: 'Encontre ofertas nas lojas que você conectou.',
    planNote: 'Exclusivo Ultimate',
    route: '/ofertas?aba=comparador',
  },
  alertas: {
    key: 'alertas',
    name: 'Alertas de preço',
    description: 'Acompanhe produtos e saiba quando o preço mudar.',
    planNote: 'Exclusivo Ultimate',
    route: '/ofertas#alertas',
  },
};

export const PUBLIC_RESOURCE_LIST: PublicResourceDefinition[] = [
  PUBLIC_RESOURCES.copiador,
  PUBLIC_RESOURCES.mensagens,
  PUBLIC_RESOURCES.identidade,
  PUBLIC_RESOURCES.cards,
  PUBLIC_RESOURCES.vitrine,
  PUBLIC_RESOURCES.metricas,
  PUBLIC_RESOURCES.busca,
  PUBLIC_RESOURCES.alertas,
];

export const KNOWN_ACCOUNT_STORAGE_KEY = 'radar_known_account';
export const SIGNUP_DRAFT_STORAGE_KEY = 'radar_signup_draft';

/**
 * Garante que o caminho de redirecionamento é uma rota interna segura da aplicação.
 */
export function sanitizeInternalRedirect(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  return trimmed;
}

export function resolveIntentInfo(params: {
  recurso?: string | null;
  redirect?: string | null;
}): { name: string; route: string; key?: PublicResourceKey } | null {
  const rawKey = (params.recurso || '').trim().toLowerCase() as PublicResourceKey;
  const safeRedirect = sanitizeInternalRedirect(params.redirect);

  if (rawKey && rawKey in PUBLIC_RESOURCES) {
    const def = PUBLIC_RESOURCES[rawKey];
    return {
      key: def.key,
      name: def.name,
      route: safeRedirect || def.route,
    };
  }

  if (safeRedirect) {
    const matched = PUBLIC_RESOURCE_LIST.find((item) => item.route === safeRedirect);
    if (matched) {
      return {
        key: matched.key,
        name: matched.name,
        route: safeRedirect,
      };
    }
    if (safeRedirect !== '/painel') {
      return {
        name: 'seu painel',
        route: safeRedirect,
      };
    }
  }

  return null;
}

export function hasKnownAccountPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KNOWN_ACCOUNT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markKnownAccountPreference(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KNOWN_ACCOUNT_STORAGE_KEY, '1');
  } catch {}
}

