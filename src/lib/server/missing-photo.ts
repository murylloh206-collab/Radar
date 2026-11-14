import 'server-only';
import { rakutenFetch, type RakutenCredentials } from './rakuten-auth';

/*
 * Quando a loja não fornece foto (Amazon e Netshoes bloqueiam a leitura da página e a origem manda só texto):
 *  1) Netshoes: foto oficial pela API de produtos da Rakuten (busca pelo nome, confere código/nome);
 *  2) Amazon: imagem pública pelo código do produto (ASIN). Sem foto, a oferta espera (nada sai sem imagem).
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

/**
 * Amazon: imagem pública pelo código do produto (ASIN), 500x500. Produtos sem imagem nesse endereço
 * devolvem um GIF de 1 pixel — tratado como "sem foto".
 */
export async function findAmazonPhotoByAsin(
  asin: string,
  fetchImpl: (url: string) => Promise<Response> = url => fetch(url, { signal: AbortSignal.timeout(8_000) })
): Promise<string | undefined> {
  if (!/^[A-Z0-9]{10}$/i.test(String(asin || ''))) return undefined;
  const url = `https://m.media-amazon.com/images/P/${asin.toUpperCase()}.01.LZZZZZZZ.jpg`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok || !/^image\/(jpeg|png|webp)/i.test(res.headers.get('content-type') || '')) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    const { default: sharp } = await import('sharp');
    const meta = await sharp(buf).metadata();
    return (meta.width || 0) >= 200 && (meta.height || 0) >= 200 ? url : undefined;
  } catch {
    return undefined;
  }
}
