import sharp from 'sharp';
import crypto from 'node:crypto';
import { supabase } from '../supabase';

/**
 * Converte URLs de CDNs de e-commerce conhecidas para a versão master
 * em alta resolução (Retina / 2X), evitando thumbnails e fotos reduzidas.
 */
function getHighResCandidateUrls(originalUrl: string): string[] {
  const candidates: string[] = [];

  // Mercado Livre: tentar variantes 2X (-F.jpg e -O.jpg)
  if (originalUrl.includes('mlstatic.com')) {
    const ml2xF = originalUrl
      .replace('D_NQ_NP_', 'D_NQ_NP_2X_')
      .replace(/-[A-Z](?:-[^.]+)?\.(?:jpg|webp)$/i, '-F.jpg');
    if (ml2xF !== originalUrl) candidates.push(ml2xF);

    const ml2xO = originalUrl
      .replace('D_NQ_NP_', 'D_NQ_NP_2X_')
      .replace(/-[A-Z](?:-[^.]+)?\.(?:jpg|webp)$/i, '-O.jpg');
    if (ml2xO !== originalUrl && ml2xO !== ml2xF) candidates.push(ml2xO);

    const mlF = originalUrl.replace(/-[A-Z](?:-[^.]+)?\.(?:jpg|webp)$/i, '-F.jpg');
    if (mlF !== originalUrl && !candidates.includes(mlF)) candidates.push(mlF);
  }

  // Shopee: remover sufixos de miniatura (_tn)
  if (originalUrl.includes('susercontent.com') && originalUrl.includes('_tn')) {
    const cleanShopee = originalUrl.replace(/_tn(\.[a-z]+)?$/i, '');
    candidates.push(cleanShopee);
  }

  // Amazon: substituir dimensões reduzidas pela versão master SL1500
  if (originalUrl.includes('amazon') || originalUrl.includes('media-amazon')) {
    const amzHd = originalUrl.replace(/\._AC_[A-Z0-9_,]+_\./i, '._AC_SL1500_.');
    if (amzHd !== originalUrl) candidates.push(amzHd);
  }

  // Netshoes: usar imagem zoom/master
  if (originalUrl.includes('netshoes.com.br')) {
    const nsZoom = originalUrl.replace(/\/(?:detalhe|thumb)\//i, '/zoom/');
    if (nsZoom !== originalUrl) candidates.push(nsZoom);
  }

  candidates.push(originalUrl);
  return candidates;
}

/**
 * Baixa o buffer da imagem buscando a melhor resolução disponível
 */
async function fetchBestImageBuffer(url: string): Promise<Buffer | null> {
  const candidates = getHighResCandidateUrls(url);

  for (const candidate of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(candidate, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        if (arrayBuf.byteLength >= 5000) {
          return Buffer.from(arrayBuf);
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Otimiza a foto oficial do produto para exibição ultranítida e perfeita no WhatsApp em qualquer celular.
 * - Formato: 1200x1200 (proporção quadrada 1:1, cobrindo telas 3x/Retina de celulares modernos sem esticar nem borrar).
 * - Fundo limpo: branco puro #FFFFFF oficial de e-commerce, sem cortes em partes do produto.
 * - Margem de respiro: 60px em cada borda (máximo 1080x1080 no centro) para que o balão do WhatsApp nunca corte o produto.
 * - Interpolação Lanczos3 + Sharpen adaptativo: bordas e textos de embalagens cristalinos em telas compactas.
 * - Baseline JPEG (progressive: false): evita que o WhatsApp no Android mostre o scan de baixa qualidade no balão.
 * - Chroma Subsampling 4:4:4: preserva 100% da fidelidade de cores em telas OLED/Retina.
 */
export async function optimizeProductImageForWhatsApp(
  imageUrl: string | undefined,
  userId: string = '00000000-0000-0000-0000-000000000001'
): Promise<string | undefined> {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return imageUrl;
  }

  const timeoutPromise = new Promise<string>((resolve) => {
    setTimeout(() => resolve(imageUrl), 6000);
  });

  const processPromise = (async (): Promise<string> => {
    try {
      const inputBuffer = await fetchBestImageBuffer(imageUrl);
      if (!inputBuffer) {
        return imageUrl;
      }

      const targetSize = 1200;
      const maxInnerSize = 1080;

      // Redimensionar para caber dentro da área útil (1080x1080) com interpolação Lanczos3 e realce de nitidez
      const innerBuffer = await sharp(inputBuffer)
        .resize(maxInnerSize, maxInnerSize, {
          fit: 'inside',
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: false,
        })
        .sharpen({ sigma: 1, m1: 0.75, m2: 0.5 })
        .toBuffer();

      // Montar sobre tela quadrada 1200x1200 com fundo branco limpo
      const squareBuffer = await sharp({
        create: {
          width: targetSize,
          height: targetSize,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .composite([{ input: innerBuffer, gravity: 'centre' }])
        .jpeg({
          quality: 94,
          chromaSubsampling: '4:4:4', // 100% de nitidez de cor em qualquer tela
          progressive: false,         // Baseline JPEG: Decodificação nítida imediata no WhatsApp
        })
        .toBuffer();

      // Upload para o Supabase Storage
      if (supabase) {
        const hash = crypto.createHash('sha256').update(imageUrl).digest('hex').slice(0, 20);
        const storagePath = `${userId}/clean-products/${hash}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('radar-media')
          .upload(storagePath, squareBuffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (!uploadError) {
          const { data } = supabase.storage.from('radar-media').getPublicUrl(storagePath);
          if (data?.publicUrl) {
            return data.publicUrl;
          }
        }
      }

      return imageUrl;
    } catch {
      return imageUrl;
    }
  })();

  return Promise.race([processPromise, timeoutPromise]);
}
