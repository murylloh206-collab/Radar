import 'server-only';
import sharp from 'sharp';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type BrandAssetKind = 'logo' | 'story_background';
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

export class BrandAssetError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Confere o arquivo pelo conteúdo (não pela extensão) e gera a versão final no tamanho certo. */
export async function normalizeBrandAsset(kind: BrandAssetKind, input: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  if (input.length > MAX_ASSET_BYTES) throw new BrandAssetError('A imagem passa de 8 MB. Envie uma versão menor.');
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new BrandAssetError('Esse arquivo não é uma imagem. Envie PNG, JPG ou WebP.');
  }
  if (!['png', 'jpeg', 'webp'].includes(String(meta.format))) throw new BrandAssetError('Formato não aceito. Envie PNG, JPG ou WebP.');
  if (kind === 'logo') {
    if ((meta.width || 0) < 64 || (meta.height || 0) < 64) throw new BrandAssetError('Logo pequena demais (mínimo 64×64).');
    const buffer = await sharp(input).rotate().resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return { buffer, contentType: 'image/png' };
  }
  if ((meta.width || 0) < 540 || (meta.height || 0) < 960) throw new BrandAssetError('Imagem de fundo pequena demais (mínimo 540×960, ideal 1080×1920).');
  const buffer = await sharp(input).rotate().resize(1080, 1920, { fit: 'cover', position: 'centre' }).jpeg({ quality: 90 }).toBuffer();
  return { buffer, contentType: 'image/jpeg' };
}

export const storyBackgroundPath = (userId: string) => `brand/${userId}/story-background.jpg`;

function bucket() {
  if (!isSupabaseConfigured || !supabase) throw new BrandAssetError('Armazenamento indisponível.', 503);
  return supabase.storage.from('radar-media');
}

export async function saveBrandAsset(userId: string, kind: BrandAssetKind, file: { buffer: Buffer; contentType: string }): Promise<string> {
  const path = kind === 'logo' ? `brand/${userId}/logo-${Date.now()}.png` : storyBackgroundPath(userId);
  const { error } = await bucket().upload(path, file.buffer, { contentType: file.contentType, upsert: true, cacheControl: '60' });
  if (error) throw new BrandAssetError(`Não consegui salvar a imagem: ${error.message}`, 500);
  return `${bucket().getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

/** Fundo do story do cliente (ou null se não houver). */
export async function loadStoryBackground(userId: string): Promise<Buffer | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.storage.from('radar-media').download(storyBackgroundPath(userId));
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function storyBackgroundUrl(userId: string): Promise<string | null> {
  return (await loadStoryBackground(userId)) ? `${bucket().getPublicUrl(storyBackgroundPath(userId)).data.publicUrl}?v=${Date.now()}` : null;
}

export async function removeStoryBackground(userId: string): Promise<void> {
  await bucket().remove([storyBackgroundPath(userId)]);
}

export function validateAssetKind(value: unknown): BrandAssetKind | null {
  return value === 'logo' || value === 'story_background' ? value : null;
}
