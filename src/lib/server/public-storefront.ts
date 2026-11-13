import 'server-only';
import { ADMIN_UUID } from './auth';
import fs from 'node:fs';
import path from 'node:path';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getBrandSettings } from '@/lib/server/brand-settings';

export interface PublicPageConfig {
  title: string;
  bio: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string;
  btn1Text: string;
  btn1Url: string;
  btn2Text: string;
  btn2Url: string;
  updatedAt: string;
}

export const DEFAULT_PUBLIC_PAGE_CONFIG: PublicPageConfig = {
  title: 'Radar de Ofertas',
  bio: 'Ofertas verificadas que valem a pena. Promoções de tecnologia, casa e conforto selecionadas para você.',
  slug: 'radar-ofertas',
  logoUrl: null,
  accentColor: '#6366f1',
  btn1Text: 'Entrar no grupo de ofertas (WhatsApp)',
  btn1Url: '',
  btn2Text: 'Canal de ofertas no Telegram',
  btn2Url: '',
  updatedAt: new Date().toISOString(),
};

export function getPublicPageFilePath(): string {
  const dir = path.join(process.cwd(), '.data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'public_page.json');
}

const localStorefrontMemory = new Map<string, PublicPageConfig>();

export async function loadPublicStorefrontConfig(userId?: string): Promise<PublicPageConfig> {
  const brand = await getBrandSettings(userId);

  if (userId && localStorefrontMemory.has(userId)) {
    return localStorefrontMemory.get(userId)!;
  }

  if (isSupabaseConfigured && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('public_storefronts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        const res: PublicPageConfig = {
          title: data.title || brand.panelName || DEFAULT_PUBLIC_PAGE_CONFIG.title,
          bio: data.bio || DEFAULT_PUBLIC_PAGE_CONFIG.bio,
          slug: data.slug || DEFAULT_PUBLIC_PAGE_CONFIG.slug,
          logoUrl: data.logo_url || brand.panelLogoUrl || null,
          accentColor: data.accent_color || brand.accentColor || DEFAULT_PUBLIC_PAGE_CONFIG.accentColor,
          btn1Text: data.btn1_text || DEFAULT_PUBLIC_PAGE_CONFIG.btn1Text,
          btn1Url: data.btn1_url || '',
          btn2Text: data.btn2_text || DEFAULT_PUBLIC_PAGE_CONFIG.btn2Text,
          btn2Url: data.btn2_url || '',
          updatedAt: data.updated_at || new Date().toISOString(),
        };
        localStorefrontMemory.set(userId, res);
        return res;
      }
    } catch {}
  }

  try {
    const file = getPublicPageFilePath();
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        ...DEFAULT_PUBLIC_PAGE_CONFIG,
        ...raw,
        logoUrl: raw.logoUrl ?? brand.panelLogoUrl ?? null,
        accentColor: raw.accentColor || brand.accentColor || DEFAULT_PUBLIC_PAGE_CONFIG.accentColor,
      };
    }
  } catch {}

  return {
    ...DEFAULT_PUBLIC_PAGE_CONFIG,
    title: brand.panelName || DEFAULT_PUBLIC_PAGE_CONFIG.title,
    logoUrl: brand.panelLogoUrl || null,
    accentColor: brand.accentColor || DEFAULT_PUBLIC_PAGE_CONFIG.accentColor,
  };
}

export async function savePublicStorefrontConfig(
  userId: string,
  config: Partial<PublicPageConfig>
): Promise<PublicPageConfig> {
  const current = await loadPublicStorefrontConfig(userId);
  const updated: PublicPageConfig = {
    ...current,
    ...config,
    updatedAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase && userId) {
    try {
      await supabase.from('public_storefronts').upsert({
        user_id: userId,
        title: updated.title,
        bio: updated.bio,
        slug: updated.slug,
        logo_url: updated.logoUrl,
        accent_color: updated.accentColor,
        btn1_text: updated.btn1Text,
        btn1_url: updated.btn1Url,
        btn2_text: updated.btn2Text,
        btn2_url: updated.btn2Url,
        updated_at: updated.updatedAt,
      }, { onConflict: 'user_id' });
    } catch {}
  }

  localStorefrontMemory.set(userId, updated);
  return updated;
}


/** Descobre de qual cliente é a página da bio pelo endereço (/u/<slug>). O endereço padrão é da conta dona. */
export async function resolveStorefrontUserId(rawSlug: string): Promise<string | null> {
  const slug = decodeURIComponent(rawSlug || '').replace(/^@+/, '').trim().toLowerCase();
  if (!slug || !/^[a-z0-9._-]{2,40}$/.test(slug)) return null;
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.from('public_storefronts').select('user_id').ilike('slug', slug).limit(2);
      if (data?.length === 1) return String(data[0].user_id);
      if (data && data.length > 1) return null; // endereço ambíguo: não arrisca mostrar a loja errada
    } catch {}
  }
  const matches = Array.from(localStorefrontMemory.entries()).filter(([, config]) => (config.slug || '').toLowerCase() === slug);
  if (matches.length === 1) return matches[0][0];
  if (slug === DEFAULT_PUBLIC_PAGE_CONFIG.slug) return ADMIN_UUID;
  return null;
}
