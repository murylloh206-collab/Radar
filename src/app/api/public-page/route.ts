import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { checkPlanFeatureAccess, resolveCurrentUserId } from '@/lib/server/plan-guard';
import { saveBrandSettings } from '@/lib/server/brand-settings';
import {
  PublicPageConfig,
  getPublicPageFilePath,
  loadPublicStorefrontConfig,
} from '@/lib/server/public-storefront';

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

    const cleanSlug = (body.slug || current.slug || 'radar-ofertas')
      .toLowerCase()
      .replace(/^@+/, '')
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const next: PublicPageConfig = {
      title: body.title ?? current.title,
      bio: body.bio ?? current.bio,
      slug: cleanSlug || 'radar-ofertas',
      logoUrl: body.logoUrl !== undefined ? body.logoUrl : current.logoUrl,
      accentColor: body.accentColor || current.accentColor || '#6366f1',
      btn1Text: body.btn1Text ?? current.btn1Text,
      btn1Url: body.btn1Url ?? current.btn1Url,
      btn2Text: body.btn2Text ?? current.btn2Text,
      btn2Url: body.btn2Url ?? current.btn2Url,
      updatedAt: new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('public_storefronts').upsert(
          {
            user_id: userId,
            slug: next.slug,
            title: next.title,
            bio: next.bio,
            logo_url: next.logoUrl,
            accent_color: next.accentColor,
            btn1_text: next.btn1Text,
            btn1_url: next.btn1Url,
            btn2_text: next.btn2Text,
            btn2_url: next.btn2Url,
            updated_at: next.updatedAt,
          },
          { onConflict: 'user_id' }
        );
      } catch {}
    }

    await saveBrandSettings(userId, {
      panelName: next.title,
      panelLogoUrl: next.logoUrl,
      accentColor: next.accentColor,
    });

    fs.writeFileSync(getPublicPageFilePath(), JSON.stringify(next, null, 2), 'utf8');
    return NextResponse.json({ ok: true, data: next });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
