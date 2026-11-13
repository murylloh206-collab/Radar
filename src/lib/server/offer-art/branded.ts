import 'server-only';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBrandSettings } from '../brand-settings';
import { DEFAULT_PLATFORM_WATERMARK } from '../../plans-config';
import { ADMIN_UUID } from '../auth';
import { buildArtTheme } from './theme';
import { renderOfferArt } from './render';
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

/** Gera a arte da oferta com a identidade (nome, logo, cor e fundo) do cliente. */
export async function renderBrandedOfferArt(userId: string, request: BrandedArtRequest): Promise<Buffer> {
  const brand = await getBrandSettings(userId);
  let logo: Buffer | null = null;
  if (brand.panelLogoUrl) {
    try { logo = await loadImage(brand.panelLogoUrl); } catch { logo = null; }
  }
  // O @ padrão da plataforma só aparece na conta dona; clientes mostram o próprio @ (ou nenhum).
  const handle = brand.watermarkHandle && (brand.watermarkHandle !== DEFAULT_PLATFORM_WATERMARK.handle || userId === ADMIN_UUID)
    ? brand.watermarkHandle : undefined;
  return renderOfferArt({
    format: request.format,
    theme: buildArtTheme(brand.accentColor, brand.artBackground || 'dark'),
    brand: { name: brand.panelName || 'Minha loja', handle, logo },
    product: { title: request.title, image: await loadImage(request.imagePathOrUrl) },
    pricing: { current: request.priceCurrent, original: request.priceOriginal ?? null, discountPct: request.discountPct ?? null },
    coupon: request.coupon || undefined,
    offerNumber: request.offerNumber,
  });
}
