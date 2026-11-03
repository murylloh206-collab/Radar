import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type MediaFormat = 'story_9_16' | 'feed_1_1' | 'feed_4_5';

export interface StoryRenderInput {
  userId: string;
  jobId?: string;
  title: string;
  priceOriginal?: string | number;
  priceCurrent: string | number;
  discountPct?: string | number;
  coupon?: string;
  imageUrl: string;
  affiliateUrl?: string;
  linkCallToAction?: string;
  format?: MediaFormat;
}

export interface StoryRenderOutput {
  ok: boolean;
  publicUrl: string;
  width: number;
  height: number;
  format: MediaFormat;
  processingMs: number;
  error?: string;
}

/**
 * Escapa strings para uso seguro em tags SVG
 */
function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Quebra o título do produto em até duas linhas sem cortar palavras
 */
function wrapTitle(text: string, maxCharsPerLine = 34): [string, string] {
  const words = (text || '').trim().split(/\s+/);
  let line1 = '';
  let line2 = '';

  for (const word of words) {
    if ((line1 + ' ' + word).trim().length <= maxCharsPerLine && !line2) {
      line1 = (line1 + ' ' + word).trim();
    } else {
      if ((line2 + ' ' + word).trim().length <= maxCharsPerLine + 6) {
        line2 = (line2 + ' ' + word).trim();
      } else {
        if (!line2.endsWith('...')) {
          line2 = (line2 + '...').slice(0, maxCharsPerLine + 6);
        }
      }
    }
  }

  return [line1 || text.slice(0, 36), line2];
}

/**
 * Converte strings ou números de preços em valor numérico Float válido
 */
export function parsePriceToNumber(raw?: string | number): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  const cleaned = String(raw).replace(/[R$\s]/g, '').trim();
  if (!cleaned) return null;

  if (cleaned.includes(',') && cleaned.includes('.')) {
    const val = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    return isNaN(val) ? null : val;
  }
  if (cleaned.includes(',')) {
    const val = parseFloat(cleaned.replace(',', '.'));
    return isNaN(val) ? null : val;
  }
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

/**
 * Formata um número no padrão monetário brasileiro (ex: "179,90" ou "1.299,00")
 */
export function formatPriceBRL(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Calcula preços e porcentagem real de desconto
 * - Se original > atual: calcula ((orig - curr) / orig) * 100
 * - Se original ausente ou menor/igual ao atual: exibe apenas o preço promocional
 */
export function calculatePricingDetails(
  priceOriginalRaw?: string | number,
  priceCurrentRaw?: string | number,
  discountPctRaw?: string | number
) {
  const orig = parsePriceToNumber(priceOriginalRaw);
  const curr = parsePriceToNumber(priceCurrentRaw);

  let hasDiscount = false;
  let discountPct = 0;
  let priceOriginalFormatted: string | null = null;
  let priceCurrentFormatted = String(priceCurrentRaw || '').trim();

  if (curr !== null && curr > 0) {
    priceCurrentFormatted = `R$ ${formatPriceBRL(curr)}`;
  } else if (!priceCurrentFormatted.toLowerCase().startsWith('r$') && priceCurrentFormatted.length > 0) {
    priceCurrentFormatted = `R$ ${priceCurrentFormatted}`;
  }

  if (orig !== null && curr !== null && orig > curr) {
    hasDiscount = true;
    discountPct = Math.round(((orig - curr) / orig) * 100);
    priceOriginalFormatted = `R$ ${formatPriceBRL(orig)}`;
  } else if (discountPctRaw) {
    const parsedDisc = parseInt(String(discountPctRaw).replace(/\D/g, ''), 10);
    if (!isNaN(parsedDisc) && parsedDisc > 0) {
      hasDiscount = true;
      discountPct = parsedDisc;
    }
  }

  return {
    hasDiscount,
    discountPct,
    discountLabel: hasDiscount ? `${discountPct}% OFF` : '',
    priceOriginalFormatted,
    priceCurrentFormatted,
  };
}

let cachedOfficialLogo: Map<number, Buffer> = new Map();

/**
 * Carrega e recorta o logotipo oficial do Radar de Ofertas em alta resolução
 * com borda sutil na cor da marca para garantir máxima nitidez e contraste.
 */
async function getOfficialLogoBuffer(size = 80, radius = 22): Promise<Buffer | null> {
  if (cachedOfficialLogo.has(size)) {
    return cachedOfficialLogo.get(size)!;
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
    const mask = Buffer.from(`
      <svg width="${size}" height="${size}">
        <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/>
      </svg>
    `);

    const border = Buffer.from(`
      <svg width="${size}" height="${size}">
        <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${radius}" ry="${radius}" fill="none" stroke="#1CCAF2" stroke-width="2" stroke-opacity="0.8"/>
      </svg>
    `);

    const logoBuffer = await sharp(logoFilePath)
      .resize(size, size, { fit: 'cover' })
      .composite([
        { input: mask, blend: 'dest-in' },
        { input: border, top: 0, left: 0 },
      ])
      .png()
      .toBuffer();

    cachedOfficialLogo.set(size, logoBuffer);
    return logoBuffer;
  } catch (err) {
    console.warn('[StoryRenderer] Falha ao carregar logotipo oficial:', err);
    return null;
  }
}

/**
 * Renderiza uma arte publicitária oficial (Story 9:16 ou Feed Post 1:1 / 4:5)
 * respeitando 100% a paleta de cores original do Radar de Ofertas.
 */
export async function renderStoryImage(input: StoryRenderInput): Promise<StoryRenderOutput> {
  const started = performance.now();
  const format: MediaFormat = input.format || 'story_9_16';

  let width = 1080;
  let height = 1920;

  if (format === 'feed_1_1') {
    width = 1080;
    height = 1080;
  } else if (format === 'feed_4_5') {
    width = 1080;
    height = 1350;
  }

  try {
    // 1. Baixar a imagem original tratada do produto
    const imageRes = await fetch(input.imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    if (!imageRes.ok) {
      throw new Error(`Não foi possível carregar a imagem do produto: HTTP ${imageRes.status}`);
    }
    const imageArrayBuffer = await imageRes.arrayBuffer();
    const originalImageBuffer = Buffer.from(imageArrayBuffer);

    // 2. Calcular preços, desconto automático e formatação
    const pricing = calculatePricingDetails(input.priceOriginal, input.priceCurrent, input.discountPct);

    const couponText = input.coupon ? `🎟️ CUPOM: ${input.coupon.toUpperCase().trim()}` : '';

    // 3. Renderizar de acordo com o formato escolhido
    let finalBuffer: Buffer;

    if (format === 'story_9_16') {
      finalBuffer = await renderStory9x16Layout({
        input,
        width,
        height,
        productImageBuffer: originalImageBuffer,
        pricing,
        couponText,
      });
    } else {
      finalBuffer = await renderFeedPostLayout({
        input,
        width,
        height,
        productImageBuffer: originalImageBuffer,
        pricing,
        couponText,
      });
    }

    // 4. Upload para o Supabase Storage ou gravação local
    const hash = crypto.randomBytes(8).toString('hex');
    const folder = format === 'story_9_16' ? 'stories' : 'feed-posts';
    const fileName = `${folder}_${input.jobId || 'preview'}_${Date.now()}_${hash}.jpg`;
    const storagePath = `${input.userId}/${folder}/${fileName}`;

    if (isSupabaseConfigured && supabase) {
      const { error: uploadErr } = await supabase.storage
        .from('radar-media')
        .upload(storagePath, finalBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (!uploadErr) {
        const { data: publicData } = supabase.storage.from('radar-media').getPublicUrl(storagePath);
        if (publicData?.publicUrl) {
          return {
            ok: true,
            publicUrl: publicData.publicUrl,
            width,
            height,
            format,
            processingMs: Math.round(performance.now() - started),
          };
        }
      }
    }

    // Fallback local se o Storage não responder
    const localDir = path.join(process.cwd(), 'public', 'generated-media', input.userId, folder);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localFilePath = path.join(localDir, fileName);
    fs.writeFileSync(localFilePath, finalBuffer);

    const localPublicUrl = `/generated-media/${input.userId}/${folder}/${fileName}`;
    return {
      ok: true,
      publicUrl: localPublicUrl,
      width,
      height,
      format,
      processingMs: Math.round(performance.now() - started),
    };
  } catch (err: any) {
    console.error('[StoryRenderer] Erro na renderização da arte:', err);
    return {
      ok: false,
      publicUrl: '',
      width,
      height,
      format,
      processingMs: Math.round(performance.now() - started),
      error: err.message || 'Falha ao renderizar a arte publicitária.',
    };
  }
}

/**
 * Layout oficial para Stories 9:16 (1080 × 1920)
 * - Cores originais: Fundo gradiente azul-marinho escuro/obsidian (#040C1A, #091A30)
 * - Destaques em Ciano (#1CCAF2) e gradiente (#0879DF a #1CCAF2)
 * - Selo Superior: "OFERTA IMPERDÍVEL" (substituindo termos antigos)
 * - Preço DE (riscado) e POR (em destaque máximo ciano com glow)
 * - Botão de compra no Instagram Stories
 */
async function renderStory9x16Layout(params: {
  input: StoryRenderInput;
  width: number;
  height: number;
  productImageBuffer: Buffer;
  pricing: ReturnType<typeof calculatePricingDetails>;
  couponText: string;
}): Promise<Buffer> {
  const { input, width, height, productImageBuffer, pricing, couponText } = params;
  const { hasDiscount, discountLabel, priceOriginalFormatted, priceCurrentFormatted } = pricing;

  const logoSize = 84;
  const logoBuffer = await getOfficialLogoBuffer(logoSize, 22);

  const productCardSize = 780;
  const productCardX = (width - productCardSize) / 2;
  const productCardY = 320;

  // Processar produto em container quadrado branco com contain (sem corte)
  const productBuffer = await sharp(productImageBuffer)
    .resize(productCardSize - 40, productCardSize - 40, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .extend({
      top: 20,
      bottom: 20,
      left: 20,
      right: 20,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .sharpen({ sigma: 1.0, m1: 0.65, m2: 0.35 })
    .toFormat('png')
    .toBuffer();

  const [t1, t2] = wrapTitle(input.title, 34);

  // CTA personalizada ou padrão
  let callToAction = input.linkCallToAction?.trim();
  if (!callToAction) {
    callToAction = '👉 COMPRE DIRETO NO LINK';
  }

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Fundo Original: Azul Marinho Escuro / Obsidian do Radar -->
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#040C1A"/>
          <stop offset="35%" stop-color="#091A30"/>
          <stop offset="70%" stop-color="#051022"/>
          <stop offset="100%" stop-color="#020813"/>
        </linearGradient>

        <!-- Gradiente Ciano Original -->
        <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0879DF"/>
          <stop offset="100%" stop-color="#1CCAF2"/>
        </linearGradient>

        <!-- Adesivo / Botão Original -->
        <linearGradient id="stickerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1CCAF2"/>
          <stop offset="100%" stop-color="#0080FF"/>
        </linearGradient>

        <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="20" stdDeviation="30" flood-color="#000" flood-opacity="0.65"/>
        </filter>

        <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>

      <!-- Fundo Original -->
      <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>

      <!-- Círculos de Radar Originais -->
      <circle cx="${width / 2}" cy="710" r="480" fill="none" stroke="#1CCAF2" stroke-width="1.5" stroke-opacity="0.08"/>
      <circle cx="${width / 2}" cy="710" r="620" fill="none" stroke="#1CCAF2" stroke-width="1" stroke-opacity="0.05"/>

      <!-- ================= CABEÇALHO OFICIAL (ÁREA SEGURA DO TOPO) ================= -->
      <g transform="translate(80, 160)">
        <text x="104" y="38" fill="#F8FBFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="34" letter-spacing="1">
          RADAR DE OFERTAS
        </text>
        <text x="104" y="66" fill="#8EADC7" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="18" letter-spacing="0.5">
          @radar.ofertas.br1
        </text>

        <!-- SELO SUPERIOR REQUISITADO: OFERTA IMPERDÍVEL (SUBSTITUI ACHADO) -->
        <g transform="translate(600, 10)">
          <rect width="320" height="64" rx="20" fill="url(#cyanGrad)"/>
          <text x="160" y="42" fill="#040C1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="24" text-anchor="middle" letter-spacing="0.5">
            OFERTA IMPERDÍVEL
          </text>
        </g>
      </g>

      <!-- ================= MOLDURA DO PRODUTO ================= -->
      <rect x="${productCardX - 4}" y="${productCardY - 4}" width="${productCardSize + 8}" height="${productCardSize + 8}" rx="52" fill="none" stroke="#1CCAF2" stroke-width="3" stroke-opacity="0.35"/>
      <rect x="${productCardX}" y="${productCardY}" width="${productCardSize}" height="${productCardSize}" rx="48" fill="#FFFFFF" filter="url(#cardShadow)"/>

      <!-- Selo de Desconto Flutuante Original no Card -->
      ${
        hasDiscount
          ? `
        <g transform="translate(${productCardX + productCardSize - 200}, ${productCardY + 24})">
          <rect width="180" height="64" rx="20" fill="#20C997" filter="url(#cardShadow)"/>
          <text x="90" y="42" fill="#040C1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="28" text-anchor="middle">
            -${escapeXml(discountLabel)}
          </text>
        </g>
      `
          : ''
      }

      <!-- ================= BLOCO DE TÍTULO E VALORES ================= -->
      <g transform="translate(80, 1150)">
        <text x="460" y="38" fill="#F8FBFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="40" text-anchor="middle">
          ${escapeXml(t1)}
        </text>
        ${
          t2
            ? `<text x="460" y="88" fill="#F8FBFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="34" text-anchor="middle">${escapeXml(t2)}</text>`
            : ''
        }

        <!-- Preços DE / POR -->
        <g transform="translate(0, ${t2 ? 150 : 110})">
          ${
            priceOriginalFormatted
              ? `
            <text x="460" y="0" fill="#8EADC7" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="28" text-anchor="middle" text-decoration="line-through">
              DE: ${escapeXml(priceOriginalFormatted)}
            </text>
          `
              : ''
          }
          <text x="460" y="${priceOriginalFormatted ? 64 : 50}" fill="#1CCAF2" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="68" text-anchor="middle" filter="url(#glowCyan)">
            POR: ${escapeXml(priceCurrentFormatted)}
          </text>
        </g>

        <!-- Cupom se houver -->
        ${
          couponText
            ? `
          <g transform="translate(260, ${t2 ? 260 : 220})">
            <rect width="400" height="54" rx="18" fill="#1CCAF2" fill-opacity="0.15" stroke="#1CCAF2" stroke-width="2"/>
            <text x="200" y="35" fill="#1CCAF2" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="800" font-size="24" text-anchor="middle">
              ${escapeXml(couponText)}
            </text>
          </g>
        `
            : ''
        }
      </g>

      <!-- ================= BOTÃO CTA ORIGINAL ================= -->
      <g transform="translate(140, 1530)">
        <text x="400" y="0" fill="#F8FBFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="30" text-anchor="middle" letter-spacing="0.5">
          ${escapeXml(callToAction)}
        </text>

        <g transform="translate(0, 30)">
          <rect width="800" height="110" rx="32" fill="#000000" fill-opacity="0.4" y="8"/>
          <rect width="800" height="110" rx="32" fill="url(#stickerGrad)"/>
          <rect width="800" height="110" rx="32" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-opacity="0.4"/>

          <g transform="translate(60, 32)">
            <circle cx="24" cy="24" r="22" fill="#FFFFFF"/>
            <path d="M16 18h16l-3 12H19l-3-12z" fill="#0080FF"/>
            <circle cx="19" cy="34" r="2.5" fill="#0080FF"/>
            <circle cx="29" cy="34" r="2.5" fill="#0080FF"/>
          </g>

          <text x="430" y="68" fill="#040C1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="34" text-anchor="middle" letter-spacing="1">
            COMPRE DIRETO NO LINK
          </text>
        </g>
      </g>

      <!-- ================= RODAPÉ ORIGINAL ================= -->
      <g transform="translate(80, 1800)">
        <line x1="160" y1="0" x2="760" y2="0" stroke="#18334D" stroke-width="2"/>
        <text x="460" y="44" fill="#8EADC7" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="22" text-anchor="middle">
          🎯 Radar de Ofertas
        </text>
        <text x="460" y="74" fill="#1CCAF2" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="800" font-size="18" text-anchor="middle">
          @radar.ofertas.br1
        </text>
      </g>
    </svg>
  `;

  const compositeLayers: sharp.OverlayOptions[] = [
    { input: productBuffer, top: productCardY, left: productCardX },
  ];

  if (logoBuffer) {
    compositeLayers.push({ input: logoBuffer, top: 160, left: 80 });
  }

  return sharp(Buffer.from(svg))
    .composite(compositeLayers)
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
}

/**
 * Layout oficial para Publicações de Feed (1080 × 1080 ou 1080 × 1350)
 * com a paleta original e selo "OFERTA IMPERDÍVEL".
 */
async function renderFeedPostLayout(params: {
  input: StoryRenderInput;
  width: number;
  height: number;
  productImageBuffer: Buffer;
  pricing: ReturnType<typeof calculatePricingDetails>;
  couponText: string;
}): Promise<Buffer> {
  const { input, width, height, productImageBuffer, pricing, couponText } = params;
  const { hasDiscount, discountLabel, priceOriginalFormatted, priceCurrentFormatted } = pricing;

  const isSquare = height === 1080;
  const logoSize = isSquare ? 64 : 72;
  const logoBuffer = await getOfficialLogoBuffer(logoSize, 18);

  const productCardSize = isSquare ? 620 : 700;
  const productCardX = (width - productCardSize) / 2;
  const productCardY = isSquare ? 135 : 170;

  const productBuffer = await sharp(productImageBuffer)
    .resize(productCardSize - 36, productCardSize - 36, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .extend({
      top: 18,
      bottom: 18,
      left: 18,
      right: 18,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .sharpen({ sigma: 1.0, m1: 0.65, m2: 0.35 })
    .toFormat('png')
    .toBuffer();

  const [t1, t2] = wrapTitle(input.title, 38);

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Fundo Original: Azul Marinho Escuro / Obsidian do Radar -->
        <linearGradient id="bgFeed" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#040C1A"/>
          <stop offset="40%" stop-color="#091A30"/>
          <stop offset="100%" stop-color="#020813"/>
        </linearGradient>

        <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0879DF"/>
          <stop offset="100%" stop-color="#1CCAF2"/>
        </linearGradient>

        <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000" flood-opacity="0.65"/>
        </filter>

        <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>

      <rect width="${width}" height="${height}" fill="url(#bgFeed)"/>

      <!-- Topo: Logo oficial + Selo OFERTA IMPERDÍVEL -->
      <g transform="translate(60, ${isSquare ? 46 : 60})">
        <text x="82" y="30" fill="#F8FBFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="28" letter-spacing="1">
          RADAR DE OFERTAS
        </text>
        <text x="82" y="54" fill="#8EADC7" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="15">
          @radar.ofertas.br1
        </text>

        <!-- Selo Superior Requisitado -->
        <g transform="translate(710, 4)">
          <rect width="250" height="52" rx="16" fill="url(#cyanGrad)"/>
          <text x="125" y="34" fill="#040C1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="20" text-anchor="middle" letter-spacing="0.5">
            OFERTA IMPERDÍVEL
          </text>
        </g>
      </g>

      <!-- Moldura do Produto -->
      <rect x="${productCardX - 2}" y="${productCardY - 2}" width="${productCardSize + 4}" height="${productCardSize + 4}" rx="34" fill="none" stroke="#1CCAF2" stroke-width="2" stroke-opacity="0.35"/>
      <rect x="${productCardX}" y="${productCardY}" width="${productCardSize}" height="${productCardSize}" rx="32" fill="#FFFFFF" filter="url(#cardShadow)"/>

      <!-- Selo flutuante no produto -->
      ${
        hasDiscount
          ? `
        <g transform="translate(${productCardX + productCardSize - 180}, ${productCardY + 18})">
          <rect width="160" height="48" rx="14" fill="#20C997" filter="url(#cardShadow)"/>
          <text x="80" y="32" fill="#040C1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="20" text-anchor="middle">
            -${escapeXml(discountLabel)}
          </text>
        </g>
      `
          : ''
      }

      <!-- Bloco de Informações Inferior -->
      <g transform="translate(60, ${isSquare ? 785 : 910})">
        <text x="480" y="34" fill="#F8FBFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="${isSquare ? 29 : 32}" text-anchor="middle">
          ${escapeXml(t1)}
        </text>
        ${
          t2
            ? `<text x="480" y="68" fill="#CBD5E1" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="${isSquare ? 23 : 26}" text-anchor="middle">${escapeXml(t2)}</text>`
            : ''
        }

        <!-- Preços DE / POR -->
        <g transform="translate(0, ${t2 ? (isSquare ? 114 : 124) : (isSquare ? 88 : 98)})">
          ${
            priceOriginalFormatted
              ? `
            <text x="480" y="0" fill="#8EADC7" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="24" text-anchor="middle" text-decoration="line-through">
              DE: ${escapeXml(priceOriginalFormatted)}
            </text>
          `
              : ''
          }
          <text x="480" y="${priceOriginalFormatted ? 52 : 38}" fill="#1CCAF2" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="${isSquare ? 54 : 60}" text-anchor="middle" filter="url(#glowCyan)">
            POR: ${escapeXml(priceCurrentFormatted)}
          </text>
        </g>

        <!-- Barra de Rodapé / Identificador -->
        <g transform="translate(0, ${t2 ? (isSquare ? 208 : 230) : (isSquare ? 180 : 204)})">
          <text x="480" y="16" fill="#8EADC7" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="16" text-anchor="middle">
            👉 Link nos Stories e na Bio • <tspan fill="#1CCAF2">@radar.ofertas.br1</tspan>
          </text>
        </g>
      </g>
    </svg>
  `;

  const compositeLayers: sharp.OverlayOptions[] = [
    { input: productBuffer, top: productCardY, left: productCardX },
  ];

  if (logoBuffer) {
    compositeLayers.push({ input: logoBuffer, top: isSquare ? 46 : 60, left: 60 });
  }

  return sharp(Buffer.from(svg))
    .composite(compositeLayers)
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
}
