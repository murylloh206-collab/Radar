import fs from 'node:fs';
import path from 'node:path';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ADMIN_UUID } from './auth';
import { getUserSubscription } from './plan-guard';
import { DEFAULT_PLATFORM_WATERMARK, planHasFeature } from '../plans-config';

export type WatermarkPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'
  | 'center'
  | 'custom';

export interface BrandSettingsRecord {
  userId: string;
  panelName: string;
  panelLogoUrl: string | null;
  accentColor: string;
  watermarkEnabled: boolean;
  watermarkHandle: string;
  watermarkLogoUrl: string | null;
  watermarkPosition: WatermarkPosition;
  watermarkCustomX: number; // 0..100 (%)
  watermarkCustomY: number; // 0..100 (%)
  watermarkOpacity: number; // 10..100 (%)
  watermarkScale: number; // 50..160 (%)
  safeDispatchEnabled: boolean;
  safeDispatchDelaySec: number; // 5..600s
  safeDispatchHourlyLimit: number; // 1..500 msgs/hora
  updatedAt: string;
}

const LOCAL_BRAND_FILE = path.join(process.cwd(), '.data', 'brand_settings.json');

export function getDefaultBrandSettings(userId: string = ADMIN_UUID): BrandSettingsRecord {
  return {
    userId,
    panelName: 'Radar de Ofertas',
    panelLogoUrl: null,
    accentColor: '#6366f1',
    watermarkEnabled: true,
    watermarkHandle: DEFAULT_PLATFORM_WATERMARK.handle,
    watermarkLogoUrl: null,
    watermarkPosition: 'bottom-right',
    watermarkCustomX: 82,
    watermarkCustomY: 90,
    watermarkOpacity: 95,
    watermarkScale: 100,
    safeDispatchEnabled: true,
    safeDispatchDelaySec: 45,
    safeDispatchHourlyLimit: 30,
    updatedAt: new Date().toISOString(),
  };
}

function readLocalBrandSettings(userId: string): BrandSettingsRecord | null {
  try {
    if (fs.existsSync(LOCAL_BRAND_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LOCAL_BRAND_FILE, 'utf-8'));
      if (raw && raw[userId]) {
        return { ...getDefaultBrandSettings(userId), ...raw[userId], userId };
      }
    }
  } catch {}
  return null;
}

function writeLocalBrandSettings(record: BrandSettingsRecord): void {
  try {
    const dir = path.dirname(LOCAL_BRAND_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let existing: Record<string, BrandSettingsRecord> = {};
    if (fs.existsSync(LOCAL_BRAND_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(LOCAL_BRAND_FILE, 'utf-8')) || {};
      } catch {}
    }
    existing[record.userId] = record;
    fs.writeFileSync(LOCAL_BRAND_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  } catch {}
}

export async function getBrandSettings(userIdInput?: string): Promise<BrandSettingsRecord> {
  const userId = userIdInput || ADMIN_UUID;
  const local = readLocalBrandSettings(userId);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('brand_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        const record: BrandSettingsRecord = {
          userId,
          panelName: data.panel_name || 'Radar de Ofertas',
          panelLogoUrl: data.panel_logo_url || null,
          accentColor: data.accent_color || '#6366f1',
          watermarkEnabled: data.watermark_enabled !== false,
          watermarkHandle: data.watermark_handle || DEFAULT_PLATFORM_WATERMARK.handle,
          watermarkLogoUrl: data.watermark_logo_url || null,
          watermarkPosition: (data.watermark_position as WatermarkPosition) || 'bottom-right',
          watermarkCustomX: Number(data.watermark_custom_x ?? 82),
          watermarkCustomY: Number(data.watermark_custom_y ?? 90),
          watermarkOpacity: Number(data.watermark_opacity ?? 95),
          watermarkScale: Number(data.watermark_scale ?? 100),
          safeDispatchEnabled: data.safe_dispatch_enabled !== false,
          safeDispatchDelaySec: Number(data.safe_dispatch_delay_sec ?? 45),
          safeDispatchHourlyLimit: Number(data.safe_dispatch_hourly_limit ?? 30),
          updatedAt: data.updated_at || new Date().toISOString(),
        };
        writeLocalBrandSettings(record);
        return record;
      }
    } catch {}
  }

  return local || getDefaultBrandSettings(userId);
}

export async function saveBrandSettings(
  userIdInput: string,
  partial: Partial<BrandSettingsRecord>
): Promise<BrandSettingsRecord> {
  const userId = userIdInput || ADMIN_UUID;
  const current = await getBrandSettings(userId);

  const validPositions: WatermarkPosition[] = [
    'bottom-right',
    'bottom-left',
    'top-right',
    'top-left',
    'center',
    'custom',
  ];

  const rawHandle =
    typeof partial.watermarkHandle === 'string' && partial.watermarkHandle.trim()
      ? partial.watermarkHandle.trim()
      : current.watermarkHandle;
  const normalizedHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;

  const updated: BrandSettingsRecord = {
    userId,
    panelName:
      typeof partial.panelName === 'string' && partial.panelName.trim()
        ? partial.panelName.trim().slice(0, 50)
        : current.panelName,
    panelLogoUrl:
      partial.panelLogoUrl !== undefined ? partial.panelLogoUrl : current.panelLogoUrl,
    accentColor:
      typeof partial.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(partial.accentColor.trim())
        ? partial.accentColor.trim()
        : current.accentColor,
    watermarkEnabled:
      typeof partial.watermarkEnabled === 'boolean'
        ? partial.watermarkEnabled
        : current.watermarkEnabled,
    watermarkHandle: normalizedHandle,
    watermarkLogoUrl:
      partial.watermarkLogoUrl !== undefined ? partial.watermarkLogoUrl : current.watermarkLogoUrl,
    watermarkPosition:
      partial.watermarkPosition && validPositions.includes(partial.watermarkPosition)
        ? partial.watermarkPosition
        : current.watermarkPosition,
    watermarkCustomX:
      typeof partial.watermarkCustomX === 'number'
        ? Math.max(0, Math.min(100, partial.watermarkCustomX))
        : current.watermarkCustomX,
    watermarkCustomY:
      typeof partial.watermarkCustomY === 'number'
        ? Math.max(0, Math.min(100, partial.watermarkCustomY))
        : current.watermarkCustomY,
    watermarkOpacity:
      typeof partial.watermarkOpacity === 'number'
        ? Math.max(10, Math.min(100, Math.round(partial.watermarkOpacity)))
        : current.watermarkOpacity,
    watermarkScale:
      typeof partial.watermarkScale === 'number'
        ? Math.max(50, Math.min(160, Math.round(partial.watermarkScale)))
        : current.watermarkScale,
    safeDispatchEnabled:
      typeof partial.safeDispatchEnabled === 'boolean'
        ? partial.safeDispatchEnabled
        : current.safeDispatchEnabled,
    safeDispatchDelaySec:
      typeof partial.safeDispatchDelaySec === 'number'
        ? Math.max(5, Math.min(600, Math.round(partial.safeDispatchDelaySec)))
        : current.safeDispatchDelaySec,
    safeDispatchHourlyLimit:
      typeof partial.safeDispatchHourlyLimit === 'number'
        ? Math.max(1, Math.min(500, Math.round(partial.safeDispatchHourlyLimit)))
        : current.safeDispatchHourlyLimit,
    updatedAt: new Date().toISOString(),
  };

  writeLocalBrandSettings(updated);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('brand_settings').upsert(
        {
          user_id: userId,
          panel_name: updated.panelName,
          panel_logo_url: updated.panelLogoUrl,
          accent_color: updated.accentColor,
          watermark_enabled: updated.watermarkEnabled,
          watermark_handle: updated.watermarkHandle,
          watermark_logo_url: updated.watermarkLogoUrl,
          watermark_position: updated.watermarkPosition,
          watermark_custom_x: updated.watermarkCustomX,
          watermark_custom_y: updated.watermarkCustomY,
          watermark_opacity: updated.watermarkOpacity,
          watermark_scale: updated.watermarkScale,
          safe_dispatch_enabled: updated.safeDispatchEnabled,
          safe_dispatch_delay_sec: updated.safeDispatchDelaySec,
          safe_dispatch_hourly_limit: updated.safeDispatchHourlyLimit,
          updated_at: updated.updatedAt,
        },
        { onConflict: 'user_id' }
      );
    } catch {}
  }

  return updated;
}

/**
 * Resolve as configurações efetivas de marca d'água respeitando o plano do usuário no servidor.
 * - No plano IMPULSE: força SEMPRE a marca d'água padrão da plataforma (@radar.ofertas.br1, ativa, canto inferior direito).
 * - Nos planos PLUS e ULTIMATE: aplica todas as personalizações do usuário (ativar/desativar, logo, @, posição, opacidade e tamanho).
 */
export async function resolveEffectiveWatermarkConfig(userIdInput?: string): Promise<{
  isCustomizable: boolean;
  enabled: boolean;
  handle: string;
  logoUrl: string | null;
  position: WatermarkPosition;
  customX: number;
  customY: number;
  opacity: number;
  scale: number;
}> {
  const userId = userIdInput || ADMIN_UUID;
  const [sub, settings] = await Promise.all([
    getUserSubscription(userId),
    getBrandSettings(userId),
  ]);

  const canCustomize = planHasFeature(sub.effectivePlan, 'watermark_custom');

  if (!canCustomize) {
    return {
      isCustomizable: false,
      enabled: true, // No Impulse, a marca d'água padrão é fixa e obrigatória
      handle: DEFAULT_PLATFORM_WATERMARK.handle,
      logoUrl: null,
      position: 'bottom-right',
      customX: 82,
      customY: 90,
      opacity: 95,
      scale: 100,
    };
  }

  return {
    isCustomizable: true,
    enabled: settings.watermarkEnabled,
    handle: settings.watermarkHandle || DEFAULT_PLATFORM_WATERMARK.handle,
    logoUrl: settings.watermarkLogoUrl,
    position: settings.watermarkPosition,
    customX: settings.watermarkCustomX,
    customY: settings.watermarkCustomY,
    opacity: settings.watermarkOpacity,
    scale: settings.watermarkScale,
  };
}
