import 'server-only';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBrandSettings } from '../brand-settings';
import { DEFAULT_PLATFORM_WATERMARK } from '../../plans-config';
import { ADMIN_UUID } from '../auth';
import { buildArtTheme } from './theme';
import { renderPromoArt } from './promo';
import { couponForChannel } from './promo-texts';
import { fetchProductImage } from './fetch-image';

export interface BrandedArtRequest {
  format: 'story' | 'feed';
  title: string;
  imagePathOrUrl: string;
  priceCurrent: number;
  priceOriginal?: number | null;
  discountPct?: number | null;
  coupon?: string;
  offerNumber?: number;
  /** Texto do rodapé (padrão do Instagram: "link na bio"). */
  footerCta?: string;
  /** Para onde vai: o cupom só aparece no WhatsApp. Padrão: instagram. */
  channel?: 'instagram' | 'whatsapp';
  /** "no Pix", "em até 4x"… lido da mensagem original (nunca inventado). */
  paymentNote?: string | null;
}

async function loadImage(source: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(source)) return fetchProductImage(source);
  const local = source.startsWith('/') && !fs.existsSync(source) ? path.join(process.cwd(), 'public', source) : source;
  const resolved = path.resolve(local);
  // Arquivos locais: só dentro do projeto (public/) ou da pasta temporária do sistema
  // Em produção só a pasta public/; a pasta temporária é aceita apenas em desenvolvimento e testes
  const allowed = [path.resolve(process.cwd(), 'public'), ...(process.env.NODE_ENV === 'production' ? [] : [path.resolve(os.tmpdir())])];
  if (!allowed.some(dir => resolved.startsWith(dir + path.sep)) || !fs.existsSync(resolved)) {
    throw new Error('Imagem do produto não encontrada.');
  }
  return fs.readFileSync(resolved);
}

/**
 * Gera a arte da oferta (modelo "promo", referência aprovada em 18/11) com a identidade do cliente:
 * fundo do template (quando o plano permite e há imagem), cor de destaque no preço, @ no topo e
 * texto de campanha em diagonal. Cupom só no WhatsApp; "link na bio" só no Instagram.
 */
export async function renderBrandedOfferArt(userId: string, request: BrandedArtRequest): Promise<Buffer> {
  const brand = await getBrandSettings(userId);
  let background: Buffer | null = null;
  const { checkPlanFeatureAccess } = await import('../plan-guard');
  const access = await checkPlanFeatureAccess('story_template', userId).catch(() => null);
  if (access?.allowed) {
    const { loadFeedBackground, loadStoryBackground } = await import('../brand-assets');
    // Post do feed: fundo próprio, se o cliente enviou um; senão, o mesmo do story.
    if (request.format === 'feed') background = await loadFeedBackground(userId).catch(() => null);
    if (!background) background = await loadStoryBackground(userId).catch(() => null);
  }
  // O @ padrão da plataforma só aparece na conta dona; clientes mostram o próprio @ (ou nenhum).
  const handle = brand.watermarkHandle && (brand.watermarkHandle !== DEFAULT_PLATFORM_WATERMARK.handle || userId === ADMIN_UUID)
    ? brand.watermarkHandle : undefined;
  const channel = request.channel || 'instagram';
  return renderPromoArt({
    format: request.format,
    theme: buildArtTheme(brand.accentColor, brand.artBackground || 'dark'),
    background,
    handle,
    campaignText: brand.campaignText || null,
    product: { title: request.title, image: await loadImage(request.imagePathOrUrl) },
    pricing: { current: request.priceCurrent, original: request.priceOriginal ?? null },
    paymentNote: request.paymentNote || null,
    coupon: couponForChannel(channel, request.coupon),
    offerNumber: request.offerNumber ?? null,
    footerCta: request.footerCta,
  });
}

/** Stories não mostram cupom (decisão do dono); o feed continua mostrando. */
export function couponForFormat(format: 'story' | 'feed', coupon?: string | null): string | undefined {
  return format === 'story' ? undefined : coupon || undefined;
}
