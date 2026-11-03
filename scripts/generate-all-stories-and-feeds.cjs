const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const artifactDir = path.resolve('C:/Users/Muryllo Hc/.gemini/antigravity/brain/7ccf940d-0b42-4c3a-8fdf-80b79081094b');

// Importar story-renderer compilado ou simular chamada direta da função
// Como story-renderer é TypeScript, vamos importar via tsx ou executar diretamente a lógica idêntica
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

async function renderStoryArtifact(categoryKey, title, priceOrig, priceCurr, coupon, productSvg) {
  const width = 1080;
  const height = 1920;
  const logoSize = 84;
  const logoBuffer = await getOfficialLogoBuffer(logoSize, 22);

  const productCardSize = 780;
  const productCardX = (width - productCardSize) / 2;
  const productCardY = 320;

  const rawProduct = await sharp(Buffer.from(productSvg)).png().toBuffer();
  const productBuffer = await sharp(rawProduct)
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

  const pricing = calculatePricingDetails(priceOrig, priceCurr);
  const { hasDiscount, discountLabel, priceOriginalFormatted, priceCurrentFormatted } = pricing;
  const [t1, t2] = wrapTitle(title, 34);

  const couponText = coupon ? `🎟️ CUPOM: ${coupon}` : '';
  const callToAction = hasDiscount
    ? `👉 COMPRE DIRETO NO LINK (${discountLabel})`
    : '👉 COMPRE DIRETO NO LINK';

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgStory" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#070A12"/>
          <stop offset="35%" stop-color="#0E1626"/>
          <stop offset="70%" stop-color="#0A101C"/>
          <stop offset="100%" stop-color="#050810"/>
        </linearGradient>

        <linearGradient id="goldButton" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#F59E0B"/>
          <stop offset="100%" stop-color="#FBBF24"/>
        </linearGradient>

        <filter id="shadowCard" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000" flood-opacity="0.75"/>
        </filter>
        <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>

      <rect width="${width}" height="${height}" fill="url(#bgStory)"/>
      <circle cx="${width / 2}" cy="710" r="480" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-opacity="0.06"/>
      <circle cx="${width / 2}" cy="710" r="640" fill="none" stroke="#F59E0B" stroke-width="1" stroke-opacity="0.04"/>

      <!-- Cabeçalho Oficial -->
      <g transform="translate(80, 160)">
        <text x="104" y="38" fill="#FFFFFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="34" letter-spacing="0.5">
          RADAR DE OFERTAS
        </text>
        <text x="104" y="66" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="18" letter-spacing="0.3">
          Achados que valem a pena.
        </text>

        <g transform="translate(640, 10)">
          <rect width="280" height="64" rx="20" fill="url(#goldButton)"/>
          <text x="140" y="42" fill="#090E1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="28" text-anchor="middle" letter-spacing="0.5">
            ${escapeXml(hasDiscount ? discountLabel : '🔥 ACHADO')}
          </text>
        </g>
      </g>

      <!-- Moldura do Produto -->
      <rect x="${productCardX - 3}" y="${productCardY - 3}" width="${productCardSize + 6}" height="${productCardSize + 6}" rx="46" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-opacity="0.4"/>
      <rect x="${productCardX}" y="${productCardY}" width="${productCardSize}" height="${productCardSize}" rx="44" fill="#FFFFFF" filter="url(#shadowCard)"/>

      ${
        hasDiscount
          ? `
        <g transform="translate(${productCardX + productCardSize - 210}, ${productCardY + 24})">
          <rect width="190" height="62" rx="18" fill="#090E1A" stroke="#F59E0B" stroke-width="2"/>
          <text x="95" y="41" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="26" text-anchor="middle">
            -${escapeXml(discountLabel)}
          </text>
        </g>
      `
          : ''
      }

      <!-- Bloco de Informações -->
      <g transform="translate(80, 1160)">
        <text x="460" y="38" fill="#F8FAFC" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="40" text-anchor="middle">
          ${escapeXml(t1)}
        </text>
        ${
          t2
            ? `<text x="460" y="88" fill="#E2E8F0" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="800" font-size="34" text-anchor="middle">${escapeXml(t2)}</text>`
            : ''
        }

        <g transform="translate(0, ${t2 ? 160 : 120})">
          ${
            priceOriginalFormatted
              ? `
            <text x="460" y="0" fill="#94A3B8" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="30" text-anchor="middle" text-decoration="line-through">
              DE: ${escapeXml(priceOriginalFormatted)}
            </text>
          `
              : ''
          }
          <text x="460" y="${priceOriginalFormatted ? 68 : 50}" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="68" text-anchor="middle" filter="url(#goldGlow)">
            POR: ${escapeXml(priceCurrentFormatted)}
          </text>
        </g>

        ${
          couponText
            ? `
          <g transform="translate(260, ${t2 ? 280 : 240})">
            <rect width="400" height="54" rx="18" fill="#090E1A" stroke="#F59E0B" stroke-width="2"/>
            <text x="200" y="35" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="800" font-size="24" text-anchor="middle">
              ${escapeXml(couponText)}
            </text>
          </g>
        `
            : ''
        }
      </g>

      <!-- Botão CTA -->
      <g transform="translate(140, 1560)">
        <rect width="800" height="106" rx="32" fill="#000" fill-opacity="0.5" y="6"/>
        <rect width="800" height="106" rx="32" fill="url(#goldButton)"/>
        <text x="400" y="66" fill="#090E1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="34" text-anchor="middle" letter-spacing="1">
          ${escapeXml(callToAction)}
        </text>
      </g>

      <!-- Rodapé -->
      <g transform="translate(80, 1780)">
        <line x1="200" y1="0" x2="720" y2="0" stroke="#1E293B" stroke-width="2"/>
        <text x="460" y="44" fill="#94A3B8" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="22" text-anchor="middle">
          🎯 Radar de Ofertas • Achados que valem a pena.
        </text>
        <text x="460" y="76" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="800" font-size="20" text-anchor="middle">
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

  const outPath = path.join(artifactDir, `story_9_16_${categoryKey}.jpg`);
  fs.writeFileSync(outPath, finalStory);
  console.log(`✔ Story 9:16 gerado para ${categoryKey}: ${outPath}`);
  return outPath;
}

async function renderFeedArtifact(categoryKey, title, priceOrig, priceCurr, coupon, productSvg) {
  const width = 1080;
  const height = 1080;
  const logoSize = 64;
  const logoBuffer = await getOfficialLogoBuffer(logoSize, 16);

  const productCardSize = 620;
  const productCardX = (width - productCardSize) / 2;
  const productCardY = 135;

  const rawProduct = await sharp(Buffer.from(productSvg)).png().toBuffer();
  const productBuffer = await sharp(rawProduct)
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

  const pricing = calculatePricingDetails(priceOrig, priceCurr);
  const { hasDiscount, discountLabel, priceOriginalFormatted, priceCurrentFormatted } = pricing;
  const [t1, t2] = wrapTitle(title, 38);

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgFeed" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#070A12"/>
          <stop offset="40%" stop-color="#0E1626"/>
          <stop offset="100%" stop-color="#050810"/>
        </linearGradient>

        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#F59E0B"/>
          <stop offset="100%" stop-color="#FBBF24"/>
        </linearGradient>

        <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000" flood-opacity="0.7"/>
        </filter>
      </defs>

      <rect width="${width}" height="${height}" fill="url(#bgFeed)"/>

      <g transform="translate(60, 46)">
        <text x="82" y="30" fill="#FFFFFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="28" letter-spacing="0.5">
          RADAR DE OFERTAS
        </text>
        <text x="82" y="54" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="15">
          Achados que valem a pena.
        </text>

        <g transform="translate(740, 4)">
          <rect width="220" height="52" rx="16" fill="url(#goldGrad)"/>
          <text x="110" y="34" fill="#090E1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="23" text-anchor="middle">
            ${escapeXml(hasDiscount ? discountLabel : '⚡ OFERTA')}
          </text>
        </g>
      </g>

      <rect x="${productCardX - 2}" y="${productCardY - 2}" width="${productCardSize + 4}" height="${productCardSize + 4}" rx="34" fill="none" stroke="#F59E0B" stroke-width="2" stroke-opacity="0.35"/>
      <rect x="${productCardX}" y="${productCardY}" width="${productCardSize}" height="${productCardSize}" rx="32" fill="#FFFFFF" filter="url(#cardShadow)"/>

      ${
        hasDiscount
          ? `
        <g transform="translate(${productCardX + productCardSize - 180}, ${productCardY + 18})">
          <rect width="160" height="48" rx="14" fill="#090E1A" stroke="#F59E0B" stroke-width="2"/>
          <text x="80" y="32" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="20" text-anchor="middle">
            -${escapeXml(discountLabel)}
          </text>
        </g>
      `
          : ''
      }

      <g transform="translate(60, 785)">
        <text x="480" y="34" fill="#F8FAFC" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="29" text-anchor="middle">
          ${escapeXml(t1)}
        </text>
        ${
          t2
            ? `<text x="480" y="68" fill="#CBD5E1" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="23" text-anchor="middle">${escapeXml(t2)}</text>`
            : ''
        }

        <g transform="translate(0, ${t2 ? 114 : 88})">
          ${
            priceOriginalFormatted
              ? `
            <text x="480" y="0" fill="#94A3B8" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="24" text-anchor="middle" text-decoration="line-through">
              DE: ${escapeXml(priceOriginalFormatted)}
            </text>
          `
              : ''
          }
          <text x="480" y="${priceOriginalFormatted ? 52 : 38}" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="54" text-anchor="middle">
            POR: ${escapeXml(priceCurrentFormatted)}
          </text>
        </g>

        <g transform="translate(0, ${t2 ? 208 : 180})">
          <text x="480" y="16" fill="#94A3B8" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="16" text-anchor="middle">
            👉 Link nos Stories e na Bio • <tspan fill="#FBBF24">@radar.ofertas.br1</tspan>
          </text>
        </g>
      </g>
    </svg>
  `;

  const finalFeed = await sharp(Buffer.from(svg))
    .composite([
      { input: logoBuffer, top: 46, left: 60 },
      { input: productBuffer, top: productCardY, left: productCardX },
    ])
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();

  const outPath = path.join(artifactDir, `feed_1_1_${categoryKey}.jpg`);
  fs.writeFileSync(outPath, finalFeed);
  console.log(`✔ Feed 1:1 gerado para ${categoryKey}: ${outPath}`);
  return outPath;
}

async function run() {
  console.log('Iniciando geração de testes das 8 categorias exigidas...');

  const items = [
    {
      key: 'tenis',
      title: 'Tênis Esportivo Masculino Corrida e Caminhada Leve Conforto',
      orig: '299,90',
      curr: '179,90',
      coupon: 'RADAR10',
      svg: `
        <svg width="700" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="700" height="700" fill="#FFFFFF"/>
          <path d="M 80 430 Q 180 480 380 470 Q 560 480 620 400 Q 640 370 600 300 Q 540 220 440 200 Q 380 180 320 280 Q 220 280 120 330 Q 70 340 80 430 Z" fill="#2563EB"/>
          <path d="M 110 420 Q 280 440 480 410 Q 580 380 600 350" stroke="#F59E0B" stroke-width="12" fill="none"/>
          <circle cx="540" cy="310" r="16" fill="#FFFFFF"/>
          <text x="210" y="390" font-family="sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF">TÊNIS NITRO RUN</text>
        </svg>
      `,
    },
    {
      key: 'roupas',
      title: 'Camiseta Dry Fit Masculina Treino Academia Proteção UV50+',
      orig: '129,90',
      curr: '79,90',
      coupon: 'FIT15',
      svg: `
        <svg width="700" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="700" height="700" fill="#FFFFFF"/>
          <path d="M 240 120 Q 350 170 460 120 L 620 200 L 560 320 L 480 270 L 480 620 L 220 620 L 220 270 L 140 320 L 80 200 Z" fill="#059669"/>
          <text x="230" y="420" font-family="sans-serif" font-size="30" font-weight="bold" fill="#FFFFFF">CAMISETA DRY FIT</text>
        </svg>
      `,
    },
    {
      key: 'smartphones',
      title: 'Smartphone Galaxy S24 Ultra 5G 256GB 12GB RAM Câmera Quádrupla',
      orig: '5.999,00',
      curr: '3.899,00',
      coupon: 'S24OFF',
      svg: `
        <svg width="700" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="700" height="700" fill="#FFFFFF"/>
          <rect x="220" y="80" width="260" height="540" rx="36" fill="#0F172A" stroke="#0284C7" stroke-width="6"/>
          <rect x="235" y="95" width="230" height="510" rx="28" fill="#1E293B"/>
          <circle cx="350" cy="140" r="10" fill="#38BDF8"/>
          <text x="250" y="370" font-family="sans-serif" font-size="22" font-weight="bold" fill="#38BDF8">GALAXY S24</text>
        </svg>
      `,
    },
    {
      key: 'fones',
      title: 'Fone de Ouvido Bluetooth Sem Fio Cancelamento Ruído ANC Bateria 40h',
      orig: '349,00',
      curr: '199,00',
      coupon: 'AUDIO20',
      svg: `
        <svg width="700" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="700" height="700" fill="#FFFFFF"/>
          <path d="M 180 380 A 180 180 0 0 1 520 380" stroke="#1E293B" stroke-width="28" fill="none"/>
          <rect x="140" y="340" width="80" height="150" rx="28" fill="#0F172A" stroke="#F59E0B" stroke-width="4"/>
          <rect x="480" y="340" width="80" height="150" rx="28" fill="#0F172A" stroke="#F59E0B" stroke-width="4"/>
          <text x="240" y="440" font-family="sans-serif" font-size="28" font-weight="bold" fill="#0F172A">FONE PRO ANC</text>
        </svg>
      `,
    },
    {
      key: 'relogios',
      title: 'Smartwatch Pro Monitor Cardíaco Oxímetro Notificações WhatsApp',
      orig: '389,00',
      curr: '199,00',
      coupon: 'WATCH10',
      svg: `
        <svg width="700" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="700" height="700" fill="#FFFFFF"/>
          <rect x="300" y="80" width="100" height="540" rx="16" fill="#334155"/>
          <circle cx="350" cy="350" r="170" fill="#0F172A" stroke="#F59E0B" stroke-width="10"/>
          <circle cx="350" cy="350" r="140" fill="#1E293B"/>
          <line x1="350" y1="350" x2="350" y2="260" stroke="#F59E0B" stroke-width="6"/>
          <line x1="350" y1="350" x2="420" y2="350" stroke="#FFFFFF" stroke-width="5"/>
          <text x="270" y="420" font-family="sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF">SMARTWATCH</text>
        </svg>
      `,
    },
    {
      key: 'suplementos',
      title: 'Creatina Monohidratada 100% Pura 300g Força e Ganho de Massa',
      orig: '129,90',
      curr: '84,90',
      coupon: 'MASSA',
      svg: `
        <svg width="700" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="700" height="700" fill="#FFFFFF"/>
          <rect x="220" y="160" width="260" height="420" rx="24" fill="#0F172A" stroke="#10B981" stroke-width="6"/>
          <rect x="240" y="240" width="220" height="240" rx="12" fill="#1E293B"/>
          <text x="260" y="340" font-family="sans-serif" font-size="28" font-weight="bold" fill="#10B981">CREATINA</text>
          <text x="290" y="380" font-family="sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF">100% PURA</text>
        </svg>
      `,
    },
    {
      key: 'ferramentas',
      title: 'Parafusadeira e Furadeira de Impacto Bateria 20V Maleta com 24 Acessórios',
      orig: '499,90',
      curr: '329,90',
      coupon: 'PRO20',
      svg: `
        <svg width="700" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="700" height="700" fill="#FFFFFF"/>
          <rect x="180" y="220" width="300" height="170" rx="16" fill="#DC2626"/>
          <polygon points="480,240 600,280 600,330 480,360" fill="#374151"/>
          <rect x="240" y="370" width="90" height="180" rx="12" fill="#1F2937"/>
          <text x="210" y="310" font-family="sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF">FURADEIRA 20V</text>
        </svg>
      `,
    },
    {
      key: 'eletrodomesticos',
      title: 'Fritadeira Air Fryer 4 Litros Digital Sem Óleo Painel Touch Timer',
      orig: '599,00',
      curr: '369,00',
      coupon: 'AIRFRY',
      svg: `
        <svg width="700" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="700" height="700" fill="#FFFFFF"/>
          <rect x="180" y="120" width="340" height="480" rx="36" fill="#111827" stroke="#64748B" stroke-width="6"/>
          <circle cx="350" cy="270" r="85" fill="#1E293B" stroke="#F59E0B" stroke-width="5"/>
          <text x="315" y="280" font-family="sans-serif" font-size="28" font-weight="bold" fill="#F59E0B">200°C</text>
          <rect x="230" y="390" width="240" height="160" rx="18" fill="#1F2937"/>
          <text x="260" y="640" font-family="sans-serif" font-size="22" font-weight="bold" fill="#1E293B">AIR FRYER 4L</text>
        </svg>
      `,
    },
    {
      key: 'caso_especial_sem_original',
      title: 'Smart Lâmpada Wi-Fi RGB 10W Controle por Voz Alexa e Google',
      orig: '',
      curr: '49,90',
      coupon: '',
      svg: `
        <svg width="700" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="700" height="700" fill="#FFFFFF"/>
          <circle cx="350" cy="300" r="140" fill="#FEF08A" stroke="#EAB308" stroke-width="6"/>
          <rect x="300" y="430" width="100" height="90" rx="10" fill="#94A3B8"/>
          <text x="260" y="310" font-family="sans-serif" font-size="24" font-weight="bold" fill="#854D0E">LÂMPADA RGB</text>
        </svg>
      `,
    },
  ];

  for (const item of items) {
    await renderStoryArtifact(item.key, item.title, item.orig, item.curr, item.coupon, item.svg);
    await renderFeedArtifact(item.key, item.title, item.orig, item.curr, item.coupon, item.svg);
  }

  console.log('Todos os testes de Stories 9:16 e Feed 1:1 concluídos com sucesso!');
}

run().catch(console.error);

