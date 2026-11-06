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

export async function loadPublicStorefrontConfig(userId?: string): Promise<PublicPageConfig> {
  const brand = await getBrandSettings(userId);

  if (isSupabaseConfigured && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('public_storefronts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        return {
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

