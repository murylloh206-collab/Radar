/**
 * Utilitários puros e 100% seguros para navegador (Client Components) e servidor:
 * - Montagem de links com `?src=` por canal (WhatsApp, Telegram, Vitrine /@slug, Cards)
 * - Normalização e formatação de nomes de lojas
 * - Sanitização de URLs de fotos do WhatsApp
 * - Tipos compartilhados de interface
 *
 * IMPORTANTE: Este arquivo NUNCA deve importar `fs`, banco de dados, `plan-guard` ou módulos de `src/lib/server/*`.
 */

import type { StoreName } from './types';

export type ClickOrigin = 'whatsapp' | 'telegram' | 'vitrine' | 'card' | 'outro';

export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'custom';

export interface SafeVaultStatus {
  storeName: StoreName;
  hasCredentials: boolean;
  hasAppSecret: boolean;
  hasUserToken: boolean;
  appId?: string;
  affiliateTag?: string;
  tagIdentified?: string;
  authType: string;
  connectionStatus: 'conectado' | 'desconectado' | 'sessao_expirada' | 'revisao_manual';
  isActive: boolean;
  lastVerifiedAt?: string;
  expiresAt?: string;
  requiresBrowserExtension?: boolean;
}

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

export function appendChannelSrcParam(rawUrl: string, origin: ClickOrigin): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || trimmed === '#') return trimmed;

  try {
    if (trimmed.startsWith('/')) {
      const dummy = new URL(trimmed, 'http://localhost');
      if (!dummy.searchParams.get('src')) {
        dummy.searchParams.set('src', origin);
      }
      return `${dummy.pathname}${dummy.search}${dummy.hash}`;
    }

    const parsed = new URL(trimmed);
    if (!parsed.searchParams.get('src')) {
      parsed.searchParams.set('src', origin);
    }
    return parsed.toString();
  } catch {
    if (trimmed.includes('src=')) return trimmed;
    const sep = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${sep}src=${encodeURIComponent(origin)}`;
  }
}

export function ensureTelegramChannelSrcInText(text: string): string {
  if (!text) return '';
  return text.replace(/https?:\/\/[^\s)]+|\/r\/[a-zA-Z0-9_-]+(?:\?[^\s)]*)?/g, (matchedUrl) => {
    const cleaned = matchedUrl.replace(/([?&])src=(whatsapp|vitrine|card|outro)\b/gi, '$1src=telegram');
    return appendChannelSrcParam(cleaned, 'telegram');
  });
}

export function normalizeStoreSlug(rawStore?: string | null, url: string = ''): string {
  const s = (rawStore || '').toLowerCase().trim();
  if (s.includes('mercado') || s === 'ml' || s === 'meli') return 'mercadolivre';
  if (s.includes('shopee')) return 'shopee';
  if (s.includes('amazon')) return 'amazon';
  if (s.includes('netshoes') || s.includes('zattini')) return 'netshoes';
  if (s.includes('magalu') || s.includes('magazine')) return 'magalu';

  const u = url.toLowerCase();
  if (u.includes('mercadolivre') || u.includes('meli.la') || u.includes('mercadolibre')) return 'mercadolivre';
  if (u.includes('shopee') || u.includes('shope.ee')) return 'shopee';
  if (u.includes('amazon') || u.includes('amzn.to') || u.includes('a.co')) return 'amazon';
  if (u.includes('netshoes') || u.includes('linksynergy') || u.includes('zattini')) return 'netshoes';
  if (u.includes('magalu') || u.includes('magazineluiza')) return 'magalu';
  return 'outro';
}

export function formatStoreDisplayName(storeSlug: string): string {
  const s = normalizeStoreSlug(storeSlug);
  if (s === 'mercadolivre') return 'Mercado Livre';
  if (s === 'shopee') return 'Shopee';
  if (s === 'amazon') return 'Amazon';
  if (s === 'netshoes') return 'Netshoes';
  if (s === 'magalu') return 'Magalu';
  return 'Outros';
}

export function resolveClickOrigin(params: {
  queryOrigin?: string | null;
  referer?: string | null;
  userAgent?: string | null;
  fallbackOrigin?: ClickOrigin | null;
}): ClickOrigin {
  const q = (params.queryOrigin || '').toLowerCase().trim();
  if (q === 'whatsapp' || q === 'wa' || q === 'zap') return 'whatsapp';
  if (q === 'telegram' || q === 'tg') return 'telegram';
  if (q === 'vitrine' || q === 'bio' || q === 'biolink' || q === 'slug') return 'vitrine';
  if (q === 'card' || q === 'story' || q === 'feed') return 'card';
  if (q === 'outro') return 'outro';

  // Plano B: detecção por Referer / User-Agent apenas se ?src= não veio na URL
  const ref = (params.referer || '').toLowerCase();
  const ua = (params.userAgent || '').toLowerCase();

  if (ref.includes('/@') || ref.includes('/u/') || ref.includes('pagina-publica')) {
    return 'vitrine';
  }
  if (ref.includes('t.me') || ref.includes('telegram') || ua.includes('telegram')) {
    return 'telegram';
  }
  if (ref.includes('whatsapp') || ua.includes('whatsapp')) {
    return 'whatsapp';
  }
  if (ref.includes('instagram') || ua.includes('instagram')) {
    return 'card';
  }

  return params.fallbackOrigin || 'outro';
}

export function safeWhatsAppPictureUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const trusted =
      host === 'whatsapp.net' ||
      host.endsWith('.whatsapp.net') ||
      host === 'whatsapp.com' ||
      host.endsWith('.whatsapp.com');
    return url.protocol === 'https:' && trusted && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
