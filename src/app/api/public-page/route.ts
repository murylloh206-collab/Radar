import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { checkPlanFeatureAccess, resolveCurrentUserId } from '@/lib/server/plan-guard';
import { getBrandSettings, saveBrandSettings } from '@/lib/server/brand-settings';

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

const DEFAULT_CONFIG: PublicPageConfig = {
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

function getFilePath(): string {
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
          title: data.title || brand.panelName || DEFAULT_CONFIG.title,
          bio: data.bio || DEFAULT_CONFIG.bio,
          slug: data.slug || DEFAULT_CONFIG.slug,
          logoUrl: data.logo_url || brand.panelLogoUrl || null,
          accentColor: data.accent_color || brand.accentColor || DEFAULT_CONFIG.accentColor,
          btn1Text: data.btn1_text || DEFAULT_CONFIG.btn1Text,
          btn1Url: data.btn1_url || '',
          btn2Text: data.btn2_text || DEFAULT_CONFIG.btn2Text,
          btn2Url: data.btn2_url || '',
          updatedAt: data.updated_at || new Date().toISOString(),
        };
      }
    } catch {}
  }

  try {
    const file = getFilePath();
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        ...DEFAULT_CONFIG,
        ...raw,
        logoUrl: raw.logoUrl ?? brand.panelLogoUrl ?? null,
        accentColor: raw.accentColor || brand.accentColor || DEFAULT_CONFIG.accentColor,
      };
    }
  } catch {}

  return {
    ...DEFAULT_CONFIG,
    title: brand.panelName || DEFAULT_CONFIG.title,
    logoUrl: brand.panelLogoUrl || null,
    accentColor: brand.accentColor || DEFAULT_CONFIG.accentColor,
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const data = await loadPublicStorefrontConfig(userId);
    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const access = await checkPlanFeatureAccess('public_showcase', userId);
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          error: access.error,
          requiredPlan: access.requiredPlan,
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const current = await loadPublicStorefrontConfig(userId);

    const cleanSlug = (body.slug || current.slug || DEFAULT_CONFIG.slug)
      .toLowerCase()
      .replace(/^@+/, '')
      .trim()
      .replace(/[^a-z0-9-_]/g, '-');

    const config: PublicPageConfig = {
      title: (body.title || current.title || DEFAULT_CONFIG.title).trim(),
      bio: (body.bio || current.bio || DEFAULT_CONFIG.bio).trim(),
      slug: cleanSlug || 'radar-ofertas',
      logoUrl: body.logoUrl !== undefined ? body.logoUrl : current.logoUrl,
      accentColor:
        typeof body.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.accentColor.trim())
          ? body.accentColor.trim()
          : current.accentColor,
      btn1Text: (body.btn1Text ?? current.btn1Text).trim(),
      btn1Url: (body.btn1Url ?? current.btn1Url).trim(),
      btn2Text: (body.btn2Text ?? current.btn2Text).trim(),
      btn2Url: (body.btn2Url ?? current.btn2Url).trim(),
      updatedAt: new Date().toISOString(),
    };

    const file = getFilePath();
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');

    // Sincronizar cor de destaque e logo na identidade do painel
    await saveBrandSettings(userId, {
      panelName: config.title,
      panelLogoUrl: config.logoUrl,
      accentColor: config.accentColor,
    });

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('public_storefronts').upsert(
          {
            user_id: userId,
            slug: config.slug,
            title: config.title,
            bio: config.bio,
            logo_url: config.logoUrl,
            accent_color: config.accentColor,
            btn1_text: config.btn1Text,
            btn1_url: config.btn1Url,
            btn2_text: config.btn2Text,
            btn2_url: config.btn2Url,
            updated_at: config.updatedAt,
          },
          { onConflict: 'user_id' }
        );
      } catch {}
    }

    return NextResponse.json({ ok: true, data: config });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
