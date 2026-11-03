const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

function escapeXml(unsafe) {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parsePriceToNumber(raw) {
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

function formatPriceBRL(val) {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calculatePricingDetails(priceOriginalRaw, priceCurrentRaw, discountPctRaw) {
  const orig = parsePriceToNumber(priceOriginalRaw);
  const curr = parsePriceToNumber(priceCurrentRaw);

  let hasDiscount = false;
  let discountPct = 0;
  let priceOriginalFormatted = null;
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

function wrapTitle(text, maxCharsPerLine = 34) {
  const words = (text || '').trim().split(/\s+/);
  let line1 = '';
  let line2 = '';
  for (const word of words) {
    if ((line1 + ' ' + word).trim().length <= maxCharsPerLine && !line2) {
      line1 = (line1 + ' ' + word).trim();
    } else {
      if ((line2 + ' ' + word).trim().length <= maxCharsPerLine + 6) {
        line2 = (line2 + ' ' + word).trim();
      } else if (!line2.endsWith('...')) {
        line2 = (line2 + '...').slice(0, maxCharsPerLine + 6);
      }
    }
  }
  return [line1 || text.slice(0, 36), line2];
}

async function getOfficialLogoBuffer(size = 80, radius = 22) {
  const logoFile = path.join(process.cwd(), 'public', 'radar-logo.jpg');
  const mask = Buffer.from(`
    <svg width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/>
    </svg>
  `);
  return sharp(logoFile)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function renderRestoredStory() {
  const width = 1080;
  const height = 1920;
  const logoSize = 84;
  const logoBuffer = await getOfficialLogoBuffer(logoSize, 22);

  const productCardSize = 780;
  const productCardX = (width - productCardSize) / 2;
  const productCardY = 320;

  const dummyTenisSvg = Buffer.from(`
    <svg width="780" height="780" xmlns="http://www.w3.org/2000/svg">
      <rect width="780" height="780" fill="#FFFFFF"/>
      <path d="M 80 490 Q 200 540 450 530 Q 680 540 700 460 Q 730 430 680 350 Q 610 250 490 230 Q 420 210 360 320 Q 250 320 130 370 Q 70 380 80 490 Z" fill="#0879DF"/>
      <path d="M 120 480 Q 300 500 580 470 Q 690 440 700 410" stroke="#1CCAF2" stroke-width="14" fill="none"/>
      <circle cx="640" cy="360" r="20" fill="#FFFFFF"/>
      <text x="220" y="450" font-family="sans-serif" font-size="34" font-weight="bold" fill="#FFFFFF">TÊNIS CORRIDA NITRO</text>
    </svg>
  `);

  const productBuffer = await sharp(dummyTenisSvg)
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

  const title = 'Tênis Esportivo Nitro Corrida e Treino Masculino';
  const [t1, t2] = wrapTitle(title, 34);
  const pricing = calculatePricingDetails('429,90', '259,90');
  const { hasDiscount, discountLabel, priceOriginalFormatted, priceCurrentFormatted } = pricing;
  const couponText = '🎟️ CUPOM: RADAR10';
  const callToAction = '👉 COMPRE DIRETO NO LINK';

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

  const finalStory = await sharp(Buffer.from(svg))
    .composite([
      { input: logoBuffer, top: 160, left: 80 },
      { input: productBuffer, top: productCardY, left: productCardX },
    ])
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();

  const outPath = 'test_story_restored_palette.jpg';
  fs.writeFileSync(outPath, finalStory);
  console.log('✔ Story com paleta original restaurada e OFERTA IMPERDÍVEL gerado com sucesso!');
}

renderRestoredStory().catch(console.error);

