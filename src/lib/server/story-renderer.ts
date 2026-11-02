import sharp from 'sharp';
import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface StoryRenderInput {
  userId: string;
  jobId?: string;
  title: string;
  priceOriginal?: string;
  priceCurrent: string;
  discountPct?: string;
  coupon?: string;
  imageUrl: string;
  affiliateUrl?: string;
  linkCallToAction?: string;
}

export interface StoryRenderOutput {
  ok: boolean;
  publicUrl: string;
  width: number;
  height: number;
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
      if ((line2 + ' ' + word).trim().length <= maxCharsPerLine + 8) {
        line2 = (line2 + ' ' + word).trim();
      } else {
        if (!line2.endsWith('...')) {
          line2 = (line2 + '...').slice(0, maxCharsPerLine + 8);
        }
      }
    }
  }

  return [line1 || text.slice(0, 36), line2];
}

/**
 * Renderiza uma imagem vertical no formato Stories 9:16 (1080x1920) em alta resolução
 */
export async function renderStoryImage(input: StoryRenderInput): Promise<StoryRenderOutput> {
  const started = performance.now();
  const width = 1080;
  const height = 1920;

  try {
    // 1. Baixar a imagem original tratada do produto
    const imageRes = await fetch(input.imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Não foi possível baixar a imagem do produto: HTTP ${imageRes.status}`);
    }
    const imageArrayBuffer = await imageRes.arrayBuffer();
    const originalImageBuffer = Buffer.from(imageArrayBuffer);

    // 2. Processar a imagem do produto para o centro (780 x 780 px)
    const productCardSize = 780;
    const processedProduct = await sharp(originalImageBuffer)
      .resize(productCardSize - 40, productCardSize - 40, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .extend({
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toFormat('png')
      .toBuffer();

    // 3. Mascarar a imagem do produto com cantos arredondados
    const roundedCornersMask = Buffer.from(
      `<svg width="${productCardSize}" height="${productCardSize}">
        <rect x="0" y="0" width="${productCardSize}" height="${productCardSize}" rx="48" ry="48" fill="#fff"/>
      </svg>`
    );

    const maskedProduct = await sharp(processedProduct)
      .composite([{ input: roundedCornersMask, blend: 'dest-in' }])
      .toFormat('png')
      .toBuffer();

    // 4. Preparar textos e dados formatados
    const [titleLine1, titleLine2] = wrapTitle(input.title);
    const hasDiscount = !!input.discountPct && Number(input.discountPct.replace(/\D/g, '')) > 0;
    const cleanDiscount = (input.discountPct || '').replace(/[^0-9]/g, '');
    const discountText = hasDiscount ? `-${cleanDiscount}% OFF` : '';

    const priceDe = input.priceOriginal ? `De: R$ ${input.priceOriginal}` : '';
    const pricePor = input.priceCurrent.startsWith('R$') ? input.priceCurrent : `R$ ${input.priceCurrent}`;
    const couponText = input.coupon ? `🎟️ CUPOM: ${input.coupon.toUpperCase()}` : '';

    // Chamada do Link de Compra (solicitada pelo usuário)
    let callToAction = input.linkCallToAction?.trim();
    if (!callToAction) {
      if (hasDiscount) {
        callToAction = `👇 COMPRE AQUI COM ${cleanDiscount}% OFF 👇`;
      } else {
        callToAction = '👇 COMPRE AQUI COM O MELHOR PREÇO 👇';
      }
    }

    // 5. Criar o layout SVG vetorial com o gradiente de fundo, textos, badges e adesivo de compra
    const productCardX = (width - productCardSize) / 2; // 150px
    const productCardY = 320; // 320px do topo

    const svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#040C1A"/>
            <stop offset="35%" stop-color="#091A30"/>
            <stop offset="70%" stop-color="#051022"/>
            <stop offset="100%" stop-color="#020813"/>
          </linearGradient>

          <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#0879DF"/>
            <stop offset="100%" stop-color="#1CCAF2"/>
          </linearGradient>

          <linearGradient id="stickerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1CCAF2"/>
            <stop offset="100%" stop-color="#0080FF"/>
          </linearGradient>

          <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="20" stdDeviation="30" flood-color="#000" flood-opacity="0.6"/>
          </filter>

          <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <!-- Fundo Gradiente Escuro Sofisticado -->
        <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>

        <!-- Efeitos sutis de radar no fundo -->
        <circle cx="${width / 2}" cy="710" r="480" fill="none" stroke="#1CCAF2" stroke-width="1.5" stroke-opacity="0.08"/>
        <circle cx="${width / 2}" cy="710" r="620" fill="none" stroke="#1CCAF2" stroke-width="1" stroke-opacity="0.05"/>

        <!-- ================= CABEÇALHO (TOPO) ================= -->
        <g transform="translate(80, 100)">
          <!-- Ícone do Radar -->
          <circle cx="40" cy="40" r="38" fill="#0D1B31" stroke="#1CCAF2" stroke-width="3"/>
          <circle cx="40" cy="40" r="24" fill="none" stroke="#1CCAF2" stroke-width="2" stroke-opacity="0.5"/>
          <circle cx="40" cy="40" r="10" fill="#1CCAF2"/>
          <line x1="40" y1="40" x2="62" y2="24" stroke="#FFF" stroke-width="3" stroke-linecap="round"/>

          <!-- Nome da Marca -->
          <text x="96" y="36" fill="#F8FBFF" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="32" letter-spacing="1">
            RADAR DE OFERTAS
          </text>
          <text x="96" y="62" fill="#8EADC7" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="18" letter-spacing="0.5">
            PRODUTOS QUE VALEM A PENA
          </text>

          <!-- Badge OFERTA EXCLUSIVA -->
          <g transform="translate(620, 10)">
            <rect width="300" height="60" rx="30" fill="#FF4757"/>
            <text x="150" y="38" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="22" text-anchor="middle" letter-spacing="1">
              🔥 ACHADO DO DIA
            </text>
          </g>
        </g>

        <!-- ================= MOLDURA DA FOTO DO PRODUTO ================= -->
        <!-- Borda externa com brilho ciano -->
        <rect x="${productCardX - 4}" y="${productCardY - 4}" width="${productCardSize + 8}" height="${productCardSize + 8}" rx="52" fill="none" stroke="#1CCAF2" stroke-width="3" stroke-opacity="0.35"/>
        <rect x="${productCardX}" y="${productCardY}" width="${productCardSize}" height="${productCardSize}" rx="48" fill="#FFFFFF" filter="url(#cardShadow)"/>

        <!-- Selo de Desconto flutuante no canto da foto (se houver) -->
        ${
          hasDiscount
            ? `
          <g transform="translate(${productCardX + productCardSize - 200}, ${productCardY + 24})">
            <rect width="180" height="64" rx="20" fill="#20C997" filter="url(#cardShadow)"/>
            <text x="90" y="42" fill="#040C1A" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="28" text-anchor="middle">
              ${escapeXml(discountText)}
            </text>
          </g>
        `
            : ''
        }

        <!-- ================= BLOCO DE TÍTULO E VALORES ================= -->
        <g transform="translate(80, 1150)">
          <!-- Título Linha 1 -->
          <text x="460" y="36" fill="#F8FBFF" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="40" text-anchor="middle">
            ${escapeXml(titleLine1)}
          </text>
          ${
            titleLine2
              ? `
            <text x="460" y="86" fill="#F8FBFF" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="36" text-anchor="middle">
              ${escapeXml(titleLine2)}
            </text>
          `
              : ''
          }

          <!-- Preços De / Por -->
          <g transform="translate(0, ${titleLine2 ? 150 : 110})">
            ${
              priceDe
                ? `
              <text x="460" y="0" fill="#8EADC7" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="28" text-anchor="middle" text-decoration="line-through">
                ${escapeXml(priceDe)}
              </text>
            `
                : ''
            }
            <text x="460" y="58" fill="#1CCAF2" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="64" text-anchor="middle" filter="url(#glowCyan)">
              ${escapeXml(pricePor)}
            </text>
          </g>

          <!-- Cupom (se houver) -->
          ${
            couponText
              ? `
            <g transform="translate(260, ${titleLine2 ? 260 : 220})">
              <rect width="400" height="54" rx="18" fill="#1CCAF2" fill-opacity="0.15" stroke="#1CCAF2" stroke-width="2"/>
              <text x="200" y="35" fill="#1CCAF2" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="24" text-anchor="middle">
                ${escapeXml(couponText)}
              </text>
            </g>
          `
              : ''
          }
        </g>

        <!-- ================= DESTAQUE DO LINK DE COMPRA (SOLICITAÇÃO PRINCIPAL) ================= -->
        <g transform="translate(80, 1500)">
          <!-- Escrita em cima do Link com seta / indicador de clique -->
          <text x="460" y="30" fill="#F8FBFF" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="30" text-anchor="middle" letter-spacing="0.5">
            ${escapeXml(callToAction)}
          </text>

          <!-- Adesivo / Botão Estilo Instagram Stories -->
          <g transform="translate(60, 60)">
            <!-- Sombra do Botão -->
            <rect width="800" height="110" rx="32" fill="#000000" fill-opacity="0.4" y="8"/>
            <!-- Botão Gradiente -->
            <rect width="800" height="110" rx="32" fill="url(#stickerGrad)"/>
            
            <!-- Borda sutil branca -->
            <rect width="800" height="110" rx="32" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-opacity="0.4"/>

            <!-- Ícone de Carrinho / Sacola -->
            <g transform="translate(60, 32)">
              <circle cx="24" cy="24" r="22" fill="#FFFFFF"/>
              <path d="M16 18h16l-3 12H19l-3-12z" fill="#0080FF"/>
              <circle cx="19" cy="34" r="2.5" fill="#0080FF"/>
              <circle cx="29" cy="34" r="2.5" fill="#0080FF"/>
            </g>

            <!-- Texto do Botão -->
            <text x="430" y="68" fill="#040C1A" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="34" text-anchor="middle" letter-spacing="1">
              COMPRE DIRETO NO LINK
            </text>
          </g>
        </g>

        <!-- ================= RODAPÉ ================= -->
        <g transform="translate(80, 1800)">
          <line x1="160" y1="0" x2="760" y2="0" stroke="#18334D" stroke-width="2"/>
          <text x="460" y="44" fill="#8EADC7" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="22" text-anchor="middle">
            🎯 Radar de Ofertas — Produtos que valem a pena!
          </text>
          <text x="460" y="74" fill="#1CCAF2" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="18" text-anchor="middle">
            @radar.ofertas.br1
          </text>
        </g>
      </svg>
    `;

    // 6. Composição final com Sharp (base + produto mascarado + svg overlay)
    const baseBuffer = Buffer.from(svgOverlay);

    const finalBuffer = await sharp(baseBuffer)
      .composite([
        {
          input: maskedProduct,
          left: productCardX,
          top: productCardY,
        },
      ])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    // 7. Upload para o Supabase Storage
    const hash = crypto.randomBytes(8).toString('hex');
    const fileName = `story_${input.jobId || 'preview'}_${Date.now()}_${hash}.jpg`;
    const storagePath = `${input.userId}/stories/${fileName}`;

    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase Storage não configurado para salvar o Story.');
    }

    const { error: uploadErr } = await supabase.storage
      .from('radar-media')
      .upload(storagePath, finalBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Falha no upload para o Storage: ${uploadErr.message}`);
    }

    const { data: publicData } = supabase.storage.from('radar-media').getPublicUrl(storagePath);
    if (!publicData?.publicUrl) {
      throw new Error('Storage não retornou a URL pública da imagem 9:16 gerada.');
    }

    const elapsed = Math.round(performance.now() - started);

    return {
      ok: true,
      publicUrl: publicData.publicUrl,
      width,
      height,
      processingMs: elapsed,
    };
  } catch (err: any) {
    return {
      ok: false,
      publicUrl: '',
      width,
      height,
      processingMs: Math.round(performance.now() - started),
      error: err.message || 'Falha ao renderizar a imagem 9:16 do Story',
    };
  }
}
