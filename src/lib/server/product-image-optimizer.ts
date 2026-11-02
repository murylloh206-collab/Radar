import sharp from 'sharp';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { supabase } from '../supabase';

export interface OptimizeImageOptions {
  watermark?: boolean;
  productPageUrl?: string;
  store?: string;
  category?: string;
  jpegQuality?: number;
}

let cachedWatermarkBadge: Buffer | null = null;
const memoryCache = new Map<string, string>();

/**
 * Constrói ou recupera da memória o selo oficial de marca d'água do Radar de Ofertas.
 * - Formato: 310x48 px com cantos arredondados (rx: 23).
 * - Fundo escuro premium (#090E1A) com transparência de 94%.
 * - Borda sutil amarelo dourado (#F59E0B) com 85% de opacidade.
 * - Símbolo oficial de radar circular à esquerda (36x36 px) reutilizando o logotipo oficial.
 * - Identificador oficial @radar.ofertas.br1 em tipografia moderna de alto contraste.
 * - Posicionado de forma elegante na margem inferior livre, NUNCA sobrepondo o produto.
 */
async function getWatermarkBadgeBuffer(): Promise<Buffer | null> {
  if (cachedWatermarkBadge) {
    return cachedWatermarkBadge;
  }

  const logoCandidates = [
    path.join(process.cwd(), 'public', 'radar-logo.jpg'),
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'public', 'icon.png'),
  ];

  let logoFilePath: string | null = null;
  for (const candidate of logoCandidates) {
    if (fs.existsSync(candidate)) {
      logoFilePath = candidate;
      break;
    }
  }

  if (!logoFilePath) {
    return null;
  }

  try {
    const width = 310;
    const height = 48;
    const iconSize = 36;

    // Recorta o logotipo oficial em formato circular de alta definição
    const circleMask = Buffer.from(
      `<svg width="${iconSize}" height="${iconSize}"><circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="${iconSize / 2}" fill="#fff"/></svg>`
    );

    const circularIcon = await sharp(logoFilePath)
      .resize(iconSize, iconSize, { fit: 'cover' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // Cria a cápsula estilizada com identidade oficial (Preto/Grafite + Amarelo Dourado + Radar)
    const svgBadge = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="badgeBg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#090E1A" stop-opacity="0.94"/>
            <stop offset="100%" stop-color="#141D30" stop-opacity="0.94"/>
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="23" ry="23" 
              fill="url(#badgeBg)" stroke="#F59E0B" stroke-width="1.5" stroke-opacity="0.85"/>
        <text x="52" y="30" font-family="system-ui, -apple-system, Roboto, 'Segoe UI', sans-serif" font-size="14.5" font-weight="700" fill="#FFFFFF" letter-spacing="0.3">
          <tspan fill="#FBBF24">@</tspan>radar.ofertas.br1
        </text>
      </svg>
    `);

    cachedWatermarkBadge = await sharp(svgBadge)
      .composite([{ input: circularIcon, top: 6, left: 7 }])
      .png()
      .toBuffer();

    return cachedWatermarkBadge;
  } catch (error) {
    console.warn('[Watermark] Falha ao gerar selo da logo Radar de Ofertas:', error);
    return null;
  }
}

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
  if (originalUrl.includes('amazon') || originalUrl.includes('media-amazon')) {
    const amzHd = originalUrl.replace(/\._AC_[A-Z0-9_,]+_\./i, '._AC_SL1500_.');
    if (amzHd !== originalUrl) candidates.push(amzHd);
  }

  // 4. Netshoes / Zattini: usar imagem zoom/master
  if (originalUrl.includes('netshoes.com.br') || originalUrl.includes('zattini.com.br')) {
    const nsZoom = originalUrl
      .replace(/\/(?:detalhe|thumb|mini)\//i, '/zoom/')
      .replace(/\/(?:detalhe|thumb|mini)\./i, '/zoom.');
    if (nsZoom !== originalUrl) candidates.push(nsZoom);
  }

  // 5. Magazine Luiza (Magalu)
  if (originalUrl.includes('magazineluiza.com.br') || originalUrl.includes('magazineluiza.')) {
    const magaluHd = originalUrl.replace(/\/\d+x\d+\//i, '/original/');
    if (magaluHd !== originalUrl) candidates.push(magaluHd);
  }

  candidates.push(originalUrl);
  return Array.from(new Set(candidates));
}

/**
 * Tenta extrair a foto oficial original de alta resolução da página do produto (OpenGraph)
 * caso a imagem inicial venha de baixa qualidade ou comprimida pelo WhatsApp.
 */
async function fetchHighResFromProductPage(productPageUrl: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(productPageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const html = await res.text();

    const ogMatch =
      html.match(/<meta property=["']og:image["'] content=["'](.*?)["']/i) ||
      html.match(/<meta name=["']twitter:image["'] content=["'](.*?)["']/i);

    if (ogMatch && ogMatch[1] && ogMatch[1].startsWith('http')) {
      const extractedUrl = ogMatch[1];
      const candidates = getHighResCandidateUrls(extractedUrl);
      for (const cand of candidates) {
        const buf = await fetchSingleImage(cand);
        if (buf && buf.byteLength >= 8000) {
          return buf;
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Baixa um único buffer de imagem com timeout seguro
 */
async function fetchSingleImage(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

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
      // Se a imagem for muito pequena e tivermos a página do produto, tentar obter versão de alta resolução
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
    // Se todos os canais tiverem desvio padrão muito próximo de 0, é uma imagem lisa/em branco
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
 * - Identidade visual: marca d'água oficial do Radar de Ofertas com logotipo e @radar.ofertas.br1
 *   posicionada na margem inferior, sem nunca cobrir o produto.
 * - Fidelidade absoluta: não altera cores reais, marcas, detalhes ou variantes do anúncio.
 * - Formato: JPEG de alta qualidade (qualidade configurável 88-94%, padrão 92), baseline e chroma 4:4:4.
 */
export async function optimizeProductImageForWhatsApp(
  imageUrl: string | undefined,
  userId: string = '00000000-0000-0000-0000-000000000001',
  options: OptimizeImageOptions = { watermark: true }
): Promise<string | undefined> {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return imageUrl;
  }

  // Prevenir reprocessamento de imagem já otimizada
  if (imageUrl.includes('clean-products') || imageUrl.includes('_opt1080')) {
    return imageUrl;
  }

  const applyWatermark = options.watermark !== false;
  const cacheKey = `${imageUrl}_${applyWatermark ? 'wm' : 'nowm'}_1080`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  const timeoutPromise = new Promise<string>((resolve) => {
    setTimeout(() => resolve(imageUrl), 8000);
  });

  const processPromise = (async (): Promise<string> => {
    try {
      const inputBuffer = await fetchBestImageBuffer(imageUrl, options.productPageUrl);
      if (!inputBuffer) {
        return imageUrl;
      }

      const valid = await isValidProductImage(inputBuffer);
      if (!valid) {
        return imageUrl;
      }

      const targetSize = 1080;
      // Área útil segura do produto: 840x840 px (ocupa ~78% da tela, garantindo respiro anti-corte no WhatsApp)
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

      // 4. Marca d'água oficial Radar de Ofertas (@radar.ofertas.br1)
      if (applyWatermark) {
        const watermarkBadge = await getWatermarkBadgeBuffer();
        if (watermarkBadge) {
          const badgeMeta = await sharp(watermarkBadge).metadata();
          const bW = badgeMeta.width || 310;
          const bH = badgeMeta.height || 48;

          // Posicionado na margem inferior direita com folga elegante (1008px no topo)
          // Como o produto está restrito a no máximo 840px de altura (entre Y=120 e Y=960),
          // o selo fica 100% na margem livre inferior, NUNCA sobrepondo o produto.
          const badgeTop = targetSize - bH - 24;
          const badgeLeft = targetSize - bW - 28;

          compositeLayers.push({
            input: watermarkBadge,
            top: badgeTop,
            left: badgeLeft,
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
        .update(imageUrl + (applyWatermark ? '_wm' : '') + '_v2')
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

      // Fallback local caso o Supabase Storage não esteja acessível
      const localDir = path.join(process.cwd(), 'public', 'generated-media', userId);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      const localFilePath = path.join(localDir, `${hash}.jpg`);
      fs.writeFileSync(localFilePath, squareBuffer);

      const localPublicUrl = `/generated-media/${userId}/${hash}.jpg`;
      memoryCache.set(cacheKey, localPublicUrl);
      return localPublicUrl;
    } catch (err) {
      console.warn('[ImageOptimizer] Falha ao otimizar imagem, mantendo original:', err);
      return imageUrl;
    }
  })();

  return Promise.race([processPromise, timeoutPromise]);
}
