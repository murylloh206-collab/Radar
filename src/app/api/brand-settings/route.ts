import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import {
  getBrandSettings,
  saveBrandSettings,
  resolveEffectiveWatermarkConfig,
  type WatermarkPosition,
} from '@/lib/server/brand-settings';
import { checkPlanFeatureAccess, resolveCurrentUserId } from '@/lib/server/plan-guard';
import { getOfficialWatermarkBadge } from '@/lib/server/watermark-vector';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const [settings, effectiveWatermark, wmAccess, brandingAccess] = await Promise.all([
      getBrandSettings(userId),
      resolveEffectiveWatermarkConfig(userId),
      checkPlanFeatureAccess('watermark_custom', userId),
      checkPlanFeatureAccess('panel_branding', userId),
    ]);

    return NextResponse.json({
      ok: true,
      settings,
      effectiveWatermark,
      permissions: {
        canCustomizeWatermark: wmAccess.allowed,
        canCustomizeBranding: brandingAccess.allowed,
        requiredPlan: wmAccess.requiredPlan,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'save';

    // Renderizar o badge real da marca d'água em PNG (Data URL) para prévia ao vivo
    if (action === 'render_badge_preview') {
      const wmAccess = await checkPlanFeatureAccess('watermark_custom', userId);
      const isAllowed = wmAccess.allowed;

      const handle = isAllowed ? body.watermarkHandle || '@radar.ofertas.br1' : '@radar.ofertas.br1';
      const customLogoUrl = isAllowed ? body.watermarkLogoUrl || null : null;
      const opacity = isAllowed && typeof body.watermarkOpacity === 'number' ? body.watermarkOpacity : 95;
      const scale = isAllowed && typeof body.watermarkScale === 'number' ? body.watermarkScale : 100;
      const position: WatermarkPosition = isAllowed && body.watermarkPosition ? body.watermarkPosition : 'bottom-right';
      const customX = isAllowed && typeof body.watermarkCustomX === 'number' ? body.watermarkCustomX : 82;
      const customY = isAllowed && typeof body.watermarkCustomY === 'number' ? body.watermarkCustomY : 90;

      const badge = await getOfficialWatermarkBadge({
        handle,
        customLogoUrl,
        opacity,
        scale,
        position,
        customX,
        customY,
        targetImageWidth: 1080,
        targetImageHeight: 1080,
      });

      const badgeDataUrl = `data:image/png;base64,${badge.buffer.toString('base64')}`;

      return NextResponse.json({
        ok: true,
        badgeDataUrl,
        width: badge.width,
        height: badge.height,
        top: badge.top,
        left: badge.left,
      });
    }

    // Salvar apenas configurações de Envio Seguro (permitido em todos os planos, inclusive Impulse)
    if (action === 'save_safe_dispatch') {
      const saved = await saveBrandSettings(userId, {
        safeDispatchEnabled: body.safeDispatchEnabled,
        safeDispatchDelaySec: Number(body.safeDispatchDelaySec),
        safeDispatchHourlyLimit: Number(body.safeDispatchHourlyLimit),
      });
      return NextResponse.json({
        ok: true,
        settings: saved,
        message: 'Configurações de Envio Seguro salvas com sucesso!',
      });
    }

    // Salvar personalização de marca d'água ou identidade do painel (Exclusivo Plus e Ultimate)
    const wmAccess = await checkPlanFeatureAccess('watermark_custom', userId);
    if (!wmAccess.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          error: wmAccess.error,
          requiredPlan: wmAccess.requiredPlan,
        },
        { status: 403 }
      );
    }

    const updated = await saveBrandSettings(userId, {
      panelName: body.panelName,
      panelLogoUrl: body.panelLogoUrl,
      accentColor: body.accentColor,
      watermarkEnabled: body.watermarkEnabled,
      watermarkHandle: body.watermarkHandle,
      watermarkLogoUrl: body.watermarkLogoUrl,
      watermarkPosition: body.watermarkPosition,
      watermarkCustomX: body.watermarkCustomX !== undefined ? Number(body.watermarkCustomX) : undefined,
      watermarkCustomY: body.watermarkCustomY !== undefined ? Number(body.watermarkCustomY) : undefined,
      watermarkOpacity: body.watermarkOpacity !== undefined ? Number(body.watermarkOpacity) : undefined,
      watermarkScale: body.watermarkScale !== undefined ? Number(body.watermarkScale) : undefined,
      safeDispatchEnabled: body.safeDispatchEnabled,
      safeDispatchDelaySec: body.safeDispatchDelaySec !== undefined ? Number(body.safeDispatchDelaySec) : undefined,
      safeDispatchHourlyLimit: body.safeDispatchHourlyLimit !== undefined ? Number(body.safeDispatchHourlyLimit) : undefined,
    });

    const effectiveWatermark = await resolveEffectiveWatermarkConfig(userId);

    return NextResponse.json({
      ok: true,
      settings: updated,
      effectiveWatermark,
      message: 'Marca d’água e identidade visual salvas com sucesso!',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

