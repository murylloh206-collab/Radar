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

function wrapTitle(text, maxCharsPerLine = 38) {
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
  return [line1 || text.slice(0, 40), line2];
}

async function getOfficialLogoBuffer(size = 72, radius = 18) {
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

async function renderTestFeedPost() {
  const width = 1080;
  const height = 1080;
  const logoSize = 64;
  const logoBuffer = await getOfficialLogoBuffer(logoSize, 16);

  const productCardSize = 620;
  const dummySvg = Buffer.from(`
    <svg width="620" height="620" xmlns="http://www.w3.org/2000/svg">
      <rect width="620" height="620" fill="#FFFFFF"/>
      <rect x="180" y="80" width="260" height="460" rx="36" fill="#0F172A" stroke="#38BDF8" stroke-width="6"/>
      <rect x="195" y="95" width="230" height="430" rx="28" fill="#1E293B"/>
      <circle cx="310" cy="130" r="10" fill="#38BDF8"/>
      <text x="210" y="320" font-family="sans-serif" font-size="24" font-weight="bold" fill="#38BDF8">SMARTPHONE 5G</text>
    </svg>
  `);

  const productBuffer = await sharp(dummySvg)
    .resize(productCardSize, productCardSize, { fit: 'contain', background: '#FFFFFF' })
    .png()
    .toBuffer();

  const productCardX = (width - productCardSize) / 2;
  const productCardY = 140;

  const title = 'Smartphone Galaxy S24 Ultra 5G 256GB Câmera Quádrupla';
  const [t1, t2] = wrapTitle(title, 38);
  const discountLabel = '35% OFF';
  const priceDe = 'DE: R$ 5.999,00';
  const pricePor = 'POR: R$ 3.899,00';
  const coupon = 'GALAXY200';

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgFeed" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#080C14"/>
          <stop offset="40%" stop-color="#0F172A"/>
          <stop offset="100%" stop-color="#060911"/>
        </linearGradient>

        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#F59E0B"/>
          <stop offset="100%" stop-color="#FBBF24"/>
        </linearGradient>

        <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000" flood-opacity="0.6"/>
        </filter>
      </defs>

      <rect width="${width}" height="${height}" fill="url(#bgFeed)"/>

      <!-- Topo: Logo oficial + Selo de desconto -->
      <g transform="translate(60, 46)">
        <text x="82" y="30" fill="#FFFFFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="28" letter-spacing="0.5">
          RADAR DE OFERTAS
        </text>
        <text x="82" y="54" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="15">
          Achados que valem a pena.
        </text>

        <!-- Selo de desconto no topo direito -->
        <g transform="translate(740, 4)">
          <rect width="220" height="52" rx="16" fill="url(#goldGrad)"/>
          <text x="110" y="34" fill="#090E1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="23" text-anchor="middle">
            ${escapeXml(discountLabel)}
          </text>
        </g>
      </g>

      <!-- Moldura do Produto -->
      <rect x="${productCardX - 2}" y="${productCardY - 2}" width="${productCardSize + 4}" height="${productCardSize + 4}" rx="34" fill="none" stroke="#F59E0B" stroke-width="2" stroke-opacity="0.35"/>
      <rect x="${productCardX}" y="${productCardY}" width="${productCardSize}" height="${productCardSize}" rx="32" fill="#FFFFFF" filter="url(#cardShadow)"/>

      <!-- Selo flutuante no produto -->
      <g transform="translate(${productCardX + productCardSize - 180}, ${productCardY + 18})">
        <rect width="160" height="48" rx="14" fill="#090E1A" stroke="#F59E0B" stroke-width="2"/>
        <text x="80" y="32" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="20" text-anchor="middle">
          -${escapeXml(discountLabel)}
        </text>
      </g>

      <!-- Bloco de Informações Inferior -->
      <g transform="translate(60, 785)">
        <text x="480" y="34" fill="#F8FAFC" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="30" text-anchor="middle">
          ${escapeXml(t1)}
        </text>
        ${
          t2
            ? `<text x="480" y="70" fill="#CBD5E1" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="24" text-anchor="middle">${escapeXml(t2)}</text>`
            : ''
        }

        <!-- Preços DE / POR -->
        <g transform="translate(0, ${t2 ? 116 : 88})">
          <text x="480" y="0" fill="#94A3B8" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="24" text-anchor="middle" text-decoration="line-through">
            ${escapeXml(priceDe)}
          </text>
          <text x="480" y="52" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="54" text-anchor="middle">
            ${escapeXml(pricePor)}
          </text>
        </g>

        <!-- Barra de Rodapé / Identificador -->
        <g transform="translate(0, ${t2 ? 210 : 180})">
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

  fs.writeFileSync('test_feed_post_1080.jpg', finalFeed);
  console.log('✔ Post de Feed 1:1 gerado com sucesso! Tamanho:', Math.round(finalFeed.length / 1024), 'KB');
}

renderTestFeedPost().catch(console.error);

