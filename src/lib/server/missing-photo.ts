import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { rakutenFetch, type RakutenCredentials } from './rakuten-auth';

/*
 * Quando a loja não fornece foto (Amazon e Netshoes bloqueiam a leitura da página e a origem manda só texto):
 *  1) Netshoes: foto oficial pela API de produtos da Rakuten (busca pelo nome, confere código/nome);
 *  2) qualquer loja: arte com nome, preço e o logo da loja no lugar da foto. Nada sai sem imagem.
 */

const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Escolhe a imagem do item certo no XML da busca da Rakuten. */
export function pickNetshoesImage(xml: string, cleanUrl: string, title: string): string | null {
  const items = [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  const field = (it: string, tag: string) => ((it.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || '').trim();
  const url = String(cleanUrl || '').toUpperCase();
  // 1) código do produto (sem o sufixo de tamanho) presente no link da oferta
  for (const it of items) {
    const sku = field(it, 'sku').toUpperCase();
    const base = sku.split('-').slice(0, 3).join('-');
    if (base.length >= 8 && url.includes(base)) return field(it, 'imageurl') || null;
  }
  // 2) nome do item começa com o título (ou vice-versa)
  const t = norm(title);
  if (t.length < 8) return null;
  const matches = items.filter(it => {
    const name = norm(field(it, 'productname'));
    return name && (name.startsWith(t) || t.startsWith(name));
  });
  // Só pelo nome: aceita apenas se for inequívoco (um único item) — senão a foto poderia ser de outra versão.
  return matches.length === 1 ? field(matches[0], 'imageurl') || null : null;
}

export async function findNetshoesPhotoViaRakuten(
  creds: RakutenCredentials,
  advertiserId: string,
  cleanUrl: string,
  title: string
): Promise<string | undefined> {
  if (!creds.clientId || !creds.clientSecret || !creds.sid || !title) return undefined;
  try {
    const keyword = title.replace(/[^\p{L}\p{N} .-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    const res = await rakutenFetch(
      creds,
      `https://api.linksynergy.com/productsearch/1.0?keyword=${encodeURIComponent(keyword)}&mid=${encodeURIComponent(advertiserId || '43984')}&max=20`,
      { method: 'GET', headers: { Accept: 'application/xml' }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return undefined;
    const img = pickNetshoesImage(await res.text(), cleanUrl, title);
    return img && /^https:\/\//.test(img) ? img : undefined;
  } catch {
    return undefined;
  }
}

const STORE_LOGOS: Record<string, string> = {
  amazon: '/brands/amazon-original.png',
  netshoes: '/brands/netshoes-original.png',
  mercadolivre: '/brands/mercadolivre-original.png',
  shopee: '/brands/shopee-original.png',
  magalu: '/brands/magalu-original.png',
};

export interface NoPhotoArtDeps {
  render: (userId: string, req: any) => Promise<Buffer>;
  upload: (buffer: Buffer, path: string, contentType: string) => Promise<string | null>;
}

async function defaultDeps(): Promise<NoPhotoArtDeps> {
  const { renderBrandedOfferArt } = await import('./offer-art/branded');
  return {
    render: renderBrandedOfferArt,
    async upload(buffer, path, contentType) {
      if (!isSupabaseConfigured || !supabase) return null;
      const { error } = await supabase.storage.from('radar-media').upload(path, buffer, { contentType, upsert: true });
      if (error) return null;
      return supabase.storage.from('radar-media').getPublicUrl(path).data.publicUrl || null;
    },
  };
}

export async function createNoPhotoArt(
  input: {
    userId: string;
    store: string;
    title: string;
    priceCurrent: number;
    priceOriginal?: number | null;
    discountPct?: number | null;
    coupon?: string;
    messageId: string;
  },
  deps?: NoPhotoArtDeps
): Promise<string | undefined> {
  const logo = STORE_LOGOS[input.store];
  if (!logo || !(input.priceCurrent > 0) || !input.title) return undefined;
  try {
    const d = deps || (await defaultDeps());
    const png = await d.render(input.userId, {
      format: 'feed',
      title: input.title,
      imagePathOrUrl: logo,
      priceCurrent: input.priceCurrent,
      priceOriginal: input.priceOriginal ?? null,
      discountPct: input.discountPct ?? null,
      coupon: input.coupon,
      footerCta: 'link na mensagem',
    });
    const safeId = String(input.messageId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || `art${Date.now()}`;
    return (await d.upload(png, `copier-art/${safeId}.png`, 'image/png')) || undefined;
  } catch {
    return undefined;
  }
}
