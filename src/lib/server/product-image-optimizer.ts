import sharp from 'sharp';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { supabase } from '../supabase';
import { getOfficialWatermarkBadge } from './watermark-vector';
import { resolveEffectiveWatermarkConfig, type WatermarkPosition } from './brand-settings';

export interface OptimizeImageOptions {
  watermark?: boolean;
  watermarkHandle?: string;
  watermarkLogoUrl?: string | null;
  watermarkPosition?: WatermarkPosition;
  watermarkCustomX?: number;
  watermarkCustomY?: number;
  watermarkOpacity?: number;
  watermarkScale?: number;
  productPageUrl?: string;
  store?: string;
  category?: string;
  jpegQuality?: number;
}

const memoryCache = new Map<string, string>();

/**
 * Converte URLs de CDNs de e-commerce conhecidas para a versão master
 * em alta resolução (Retina / 2X), evitando thumbnails e fotos reduzidas.
 */
export function getHighResCandidateUrls(originalUrl: string): string[] {
  const candidates: string[] = [];

  // 1. Mercado Livre: tentar variantes 2X (-F.jpg e -O.jpg)
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

    const mlO = originalUrl.replace(/-[A-Z](?:-[^.]+)?\.(?:jpg|webp)$/i, '-O.jpg');
    if (mlO !== originalUrl && !candidates.includes(mlO)) candidates.push(mlO);
  }

  // 2. Shopee: remover sufixos de miniatura (_tn) e parâmetros de corte
  if (originalUrl.includes('susercontent.com') || originalUrl.includes('shopee.')) {
    let cleanShopee = originalUrl.replace(/_tn(\.[a-z]+)?$/i, '');
    cleanShopee = cleanShopee.replace(/@resize[^\s?]+/i, '');
    if (cleanShopee !== originalUrl) candidates.push(cleanShopee);
  }

  // 3. Amazon: substituir dimensões reduzidas pela versão master SL1500
  if (originalUrl.includes('amazon') || originalUrl.includes('media-amazon.com')) {
    const cleanAmazon = originalUrl.replace(/\._[A-Z0-9_,]+_\./i, '._AC_SL1500_.');
    if (cleanAmazon !== originalUrl) candidates.push(cleanAmazon);
  }

  // 4. Netshoes: substituir dimensões por padrão zoom
  if (originalUrl.includes('netshoes') || originalUrl.includes('ns-static')) {
    const zoomNetshoes = originalUrl
      .replace(/\/detalhe\//i, '/zoom/')
      .replace(/\/thumb\//i, '/zoom/')
      .replace(/\/400x400\//i, '/zoom/');
    if (zoomNetshoes !== originalUrl) candidates.push(zoomNetshoes);
  }

  // Adicionar URL original como fallback final
  if (!candidates.includes(originalUrl)) {
    candidates.push(originalUrl);
  }

  return candidates;
}

/**
 * Tenta raspar a foto master em alta resolução diretamente do HTML da página do produto
 */
async function fetchHighResFromProductPage(productPageUrl: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(productPageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) return null;
    const html = await res.text();

    const patterns = [
      /<meta property=["']og:image:secure_url["'] content=["']([^"']+)["']/i,
      /<meta property=["']og:image["'] content=["']([^"']+)["']/i,
      /<meta name=["']twitter:image["'] content=["']([^"']+)["']/i,
      /"image":\s*\[\s*"([^"']+)"/i,
      /"image":\s*"([^"']+)"/i,
      /<img[^>]+id=["']landingImage["'][^>]+src=["']([^"']+)["']/i,
      /<img[^>]+class=["'][^"']*ui-pdp-image[^"']*["'][^>]+src=["']([^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let extracted = match[1].replace(/&amp;/g, '&');
        if (extracted.startsWith('//')) extracted = 'https:' + extracted;
        if (extracted.startsWith('http')) {
          const buffer = await fetchSingleImage(extracted);
          if (buffer) return buffer;
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Efetua o download HTTP resiliente de uma URL de imagem
 */
async function fetchSingleImage(url: string): Promise<Buffer | null> {
  if (url.startsWith('file://') || url.startsWith('/') || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    try {
      const cleanPath = url.replace(/^file:\/\//, '');
      const filePath = cleanPath.startsWith('/') ? path.join(process.cwd(), 'public', cleanPath) : cleanPath;
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
    } catch {}
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text') || contentType.includes('html')) {
        return null;
      }
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength >= 4000) {
        return Buffer.from(arrayBuf);
      }
    }
  } catch {}
  return null;
}

/**
 * Baixa o buffer da imagem buscando a melhor resolução disponível nas CDNs oficiais
 */
async function fetchBestImageBuffer(
  url: string,
  productPageUrl?: string
): Promise<Buffer | null> {
  const candidates = getHighResCandidateUrls(url);

  for (const candidate of candidates) {
    const buffer = await fetchSingleImage(candidate);
    if (buffer) {
      if (productPageUrl && buffer.byteLength < 12000) {
        const pageHdBuffer = await fetchHighResFromProductPage(productPageUrl);
        if (pageHdBuffer && pageHdBuffer.byteLength > buffer.byteLength) {
          return pageHdBuffer;
        }
      }
      return buffer;
    }
  }

  // Fallback: se nenhuma CDN respondeu, tentar extrair direto da página oficial do anúncio
  if (productPageUrl) {
    const fromPage = await fetchHighResFromProductPage(productPageUrl);
    if (fromPage) return fromPage;
  }

  return null;
}

/**
 * Valida se a imagem não está corrompida ou excessivamente descaracterizada (tela 100% branca ou preta)
 */
async function isValidProductImage(buffer: Buffer): Promise<boolean> {
  try {
    const image = sharp(buffer);
    const meta = await image.metadata();
    if (!meta.width || !meta.height || meta.width < 50 || meta.height < 50) {
      return false;
    }
    const stats = await image.stats();
    const isBlank = stats.channels.every((c) => c.stdev < 1.0);
    if (isBlank) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Otimiza e padroniza a foto do produto para exibição profissional no WhatsApp.
 * 
 * Requisitos atendidos integralmente:
 * - Resolução: 1080 × 1080 pixels (1:1 quadrada).
 * - Enquadramento: logicamente 'contain' dentro de uma área útil segura de 840 × 840 px (~78%),
 *   deixando margens de respiro adaptativas de ~120px nas 4 bordas para que NUNCA haja corte
 *   nas prévias do balão de conversa do WhatsApp (evita o corte de tênis, televisores, celulares e ferramentas).
 * - Detecção de limites visuais: auto-trim de margens brancas/transparentes excessivas pré-existentes
 *   da foto do fornecedor para centralização perfeita do objeto real.
 * - Fundo: branco puro #FFFFFF oficial de catálogo de e-commerce limpo e sem poluição.
 * - Tratamento: interpolação Lanczos3 de alta fidelidade + sharpen adaptativo para textos e bordas nítidas.
 * - Identidade visual: nova marca d'água oficial do Radar de Ofertas:
 *   [LOGO OFICIAL] | @radar.ofertas.br1
 *   100% vetorial, sem dependência de fontes do OS, compacta, elegante e posicionada na margem livre inferior.
 * - Formato: JPEG de alta qualidade (qualidade configurável 88-94%, padrão 92), baseline e chroma 4:4:4.
 */
export async function optimizeProductImageForWhatsApp(
  imageUrl: string | undefined,
  userId: string = '00000000-0000-0000-0000-000000000001',
  options: OptimizeImageOptions = { watermark: true }
): Promise<string | undefined> {
  if (!imageUrl || (!imageUrl.startsWith('http') && !imageUrl.startsWith('/') && !imageUrl.startsWith('file://') && !/^[a-zA-Z]:[\\\/]/.test(imageUrl))) {
    return undefined;
  }

  // Prevenir reprocessamento de imagem já otimizada na versão v4 atual
  if (imageUrl.includes('clean-products') && imageUrl.includes('_v4')) {
    return imageUrl;
  }

  // Resolver configurações de marca d'água respeitando o plano no servidor (Impulse = sempre marca padrão)
  const effectiveWm = await resolveEffectiveWatermarkConfig(userId);
  const applyWatermark = effectiveWm.isCustomizable
    ? (options.watermark !== undefined ? options.watermark : effectiveWm.enabled)
    : true; // No Impulse, a marca padrão nunca pode ser desativada

  const handle = effectiveWm.isCustomizable
    ? (options.watermarkHandle || effectiveWm.handle || '@radar.ofertas.br1')
    : '@radar.ofertas.br1';
  const customLogoUrl = effectiveWm.isCustomizable
    ? (options.watermarkLogoUrl !== undefined ? options.watermarkLogoUrl : effectiveWm.logoUrl)
    : null;
  const position = effectiveWm.isCustomizable
    ? (options.watermarkPosition || effectiveWm.position)
    : 'bottom-right';
  const customX = effectiveWm.isCustomizable
    ? (options.watermarkCustomX ?? effectiveWm.customX)
    : 82;
  const customY = effectiveWm.isCustomizable
    ? (options.watermarkCustomY ?? effectiveWm.customY)
    : 90;
  const opacity = effectiveWm.isCustomizable
    ? (options.watermarkOpacity ?? effectiveWm.opacity)
    : 95;
  const scale = effectiveWm.isCustomizable
    ? (options.watermarkScale ?? effectiveWm.scale)
    : 100;

  const wmSignature = applyWatermark
    ? `wm_${handle}_${customLogoUrl ? customLogoUrl.slice(-16) : 'def'}_${position}_${customX}_${customY}_${opacity}_${scale}`
    : 'nowm';
  const cacheKey = `${imageUrl}_${wmSignature}_1080_v5`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  const timeoutPromise = new Promise<undefined>((resolve) => {
    setTimeout(() => resolve(undefined), 12000);
  });

  const processPromise = (async (): Promise<string | undefined> => {
    try {
      const inputBuffer = await fetchBestImageBuffer(imageUrl, options.productPageUrl);
      if (!inputBuffer) {
        console.warn(`[ImageOptimizer] Imagem indisponível para download: ${imageUrl}`);
        return undefined;
      }

      const valid = await isValidProductImage(inputBuffer);
      if (!valid) {
        console.warn(`[ImageOptimizer] Imagem corrompida ou vazia rejeitada: ${imageUrl}`);
        return undefined;
      }

      const targetSize = 1080;
      const maxSafeInner = 840;

      // 1. Tentar auto-trim suave para remover margens brancas desiguais pré-existentes da foto do fabricante
      let trimmedBuffer = inputBuffer;
      try {
        trimmedBuffer = await sharp(inputBuffer)
          .trim({ background: '#FFFFFF', threshold: 12 })
          .toBuffer();
      } catch {
        trimmedBuffer = inputBuffer;
      }

      // 2. Redimensionamento proporcional (contain / inside) com Lanczos3 de alta fidelidade
      const innerBuffer = await sharp(trimmedBuffer)
        .resize(maxSafeInner, maxSafeInner, {
          fit: 'inside',
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: false,
        })
        .sharpen({ sigma: 1.0, m1: 0.65, m2: 0.35 })
        .toBuffer();

      const innerMeta = await sharp(innerBuffer).metadata();
      const innerW = innerMeta.width || maxSafeInner;
      const innerH = innerMeta.height || maxSafeInner;

      // 3. Centralizar perfeitamente no canvas de 1080x1080
      const topPos = Math.round((targetSize - innerH) / 2);
      const leftPos = Math.round((targetSize - innerW) / 2);

      const compositeLayers: sharp.OverlayOptions[] = [
        {
          input: innerBuffer,
          top: topPos,
          left: leftPos,
        },
      ];

      // 4. Marca d'água oficial ou personalizada (respeitando plano do usuário)
      if (applyWatermark) {
        const badgeResult = await getOfficialWatermarkBadge({
          handle,
          customLogoUrl,
          position,
          customX,
          customY,
          opacity,
          scale,
          targetImageWidth: targetSize,
          targetImageHeight: targetSize,
        });

        if (badgeResult?.buffer) {
          compositeLayers.push({
            input: badgeResult.buffer,
            top: badgeResult.top,
            left: badgeResult.left,
          });
        }
      }

      // 5. Montar canvas 1080x1080 com fundo branco puro #FFFFFF e exportar JPEG de alta qualidade
      const quality = Math.max(88, Math.min(94, options.jpegQuality || 92));

      const squareBuffer = await sharp({
        create: {
          width: targetSize,
          height: targetSize,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .composite(compositeLayers)
        .jpeg({
          quality,
          chromaSubsampling: '4:4:4', // Fidelidade total de cor em telas AMOLED/Retina
          progressive: false,         // Baseline JPEG para renderização instantânea no WhatsApp
          mozjpeg: true,              // Otimização avançada de compressão sem perda de detalhes
        })
        .toBuffer();

      // 6. Upload para o Supabase Storage ou gravação local resiliente
      const hash = crypto
        .createHash('sha256')
        .update(imageUrl + wmSignature + '_v5')
        .digest('hex')
        .slice(0, 20);

      if (supabase) {
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
            memoryCache.set(cacheKey, data.publicUrl);
            return data.publicUrl;
          }
        }
      }

      // Fallback 1: Gravação local caso o Supabase Storage não esteja acessível (em Node local ou servidor persistente)
      try {
        const localDir = path.join(process.cwd(), 'public', 'generated-media', userId);
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        const localFilePath = path.join(localDir, `${hash}.jpg`);
        fs.writeFileSync(localFilePath, squareBuffer);

        const host = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
        if (host && host.startsWith('http')) {
          const localPublicUrl = `${host.replace(/\/+$/, '')}/generated-media/${userId}/${hash}.jpg`;
          memoryCache.set(cacheKey, localPublicUrl);
          return localPublicUrl;
        }
      } catch (fsErr) {
        // Em ambientes serverless read-only (ex: Vercel), fs.writeFileSync falhará com EROFS.
        // Nesses casos, utilizamos a Data URL Base64 inline aceita nativamente pela Evolution API!
      }

      // Fallback 2: Data URL Base64 inline aceita nativamente pela Evolution API
      const base64DataUrl = `data:image/jpeg;base64,${squareBuffer.toString('base64')}`;
      memoryCache.set(cacheKey, base64DataUrl);
      return base64DataUrl;
    } catch (err) {
      console.warn('[ImageOptimizer] Falha ao otimizar imagem:', err);
      return undefined;
    }
  })();

  return Promise.race([processPromise, timeoutPromise]);
}
