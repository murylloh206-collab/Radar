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

async function getOfficialLogoBuffer(size = 80, radius = 20) {
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

async function renderTestStory() {
  const width = 1080;
  const height = 1920;
  const logoSize = 84;
  const logoBuffer = await getOfficialLogoBuffer(logoSize, 22);

  // Criar um produto teste (Tênis esportivo)
  const productCardSize = 780;
  const tenisSvg = Buffer.from(`
    <svg width="780" height="780" xmlns="http://www.w3.org/2000/svg">
      <rect width="780" height="780" fill="#FFFFFF"/>
      <path d="M 80 490 Q 200 540 450 530 Q 680 540 700 460 Q 730 430 680 350 Q 610 250 490 230 Q 420 210 360 320 Q 250 320 130 370 Q 70 380 80 490 Z" fill="#2563EB"/>
      <path d="M 120 480 Q 300 500 580 470 Q 690 440 700 410" stroke="#F59E0B" stroke-width="14" fill="none"/>
      <circle cx="640" cy="360" r="20" fill="#FFFFFF"/>
      <text x="220" y="450" font-family="sans-serif" font-size="34" font-weight="bold" fill="#FFFFFF">TÊNIS CORRIDA NITRO</text>
    </svg>
  `);

  const productBuffer = await sharp(tenisSvg)
    .resize(productCardSize, productCardSize, { fit: 'contain', background: '#FFFFFF' })
    .png()
    .toBuffer();

  const productCardX = (width - productCardSize) / 2;
  const productCardY = 320;

  // Montar SVG de fundo e elementos gráficos
  const title = 'Tênis de Corrida Esportivo Masculino Nitro Ultra Leve';
  const [t1, t2] = wrapTitle(title, 34);
  const discountLabel = '40% OFF';
  const priceDe = 'DE: R$ 299,90';
  const pricePor = 'POR: R$ 179,90';
  const coupon = 'RADAR10';

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgStory" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#080C14"/>
          <stop offset="35%" stop-color="#0F172A"/>
          <stop offset="70%" stop-color="#0B1120"/>
          <stop offset="100%" stop-color="#050811"/>
        </linearGradient>

        <linearGradient id="goldButton" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#F59E0B"/>
          <stop offset="100%" stop-color="#FBBF24"/>
        </linearGradient>

        <filter id="shadowCard" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000" flood-opacity="0.7"/>
        </filter>
        <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>

      <!-- Fundo Preto/Grafite -->
      <rect width="${width}" height="${height}" fill="url(#bgStory)"/>

      <!-- Círculos de Radar no Fundo com Ouro Sutil -->
      <circle cx="${width / 2}" cy="710" r="480" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-opacity="0.06"/>
      <circle cx="${width / 2}" cy="710" r="640" fill="none" stroke="#F59E0B" stroke-width="1" stroke-opacity="0.04"/>

      <!-- ================= CABEÇALHO OFICIAL (TOPO) ================= -->
      <g transform="translate(80, 160)">
        <!-- Nome oficial e Slogan da Marca -->
        <text x="104" y="38" fill="#FFFFFF" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="34" letter-spacing="0.5">
          RADAR DE OFERTAS
        </text>
        <text x="104" y="66" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="18" letter-spacing="0.3">
          Achados que valem a pena.
        </text>

        <!-- Selo de Desconto no Topo Direito -->
        <g transform="translate(640, 10)">
          <rect width="280" height="64" rx="20" fill="url(#goldButton)"/>
          <text x="140" y="42" fill="#090E1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="28" text-anchor="middle" letter-spacing="0.5">
            ${escapeXml(discountLabel)}
          </text>
        </g>
      </g>

      <!-- Moldura do Produto -->
      <rect x="${productCardX - 3}" y="${productCardY - 3}" width="${productCardSize + 6}" height="${productCardSize + 6}" rx="46" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-opacity="0.4"/>
      <rect x="${productCardX}" y="${productCardY}" width="${productCardSize}" height="${productCardSize}" rx="44" fill="#FFFFFF" filter="url(#shadowCard)"/>

      <!-- Selo de Desconto flutuante no canto do produto -->
      <g transform="translate(${productCardX + productCardSize - 210}, ${productCardY + 24})">
        <rect width="190" height="62" rx="18" fill="#090E1A" stroke="#F59E0B" stroke-width="2"/>
        <text x="95" y="41" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="26" text-anchor="middle">
          -${escapeXml(discountLabel)}
        </text>
      </g>

      <!-- ================= BLOCO DE TÍTULO E VALORES ================= -->
      <g transform="translate(80, 1160)">
        <text x="460" y="38" fill="#F8FAFC" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="40" text-anchor="middle">
          ${escapeXml(t1)}
        </text>
        ${
          t2
            ? `<text x="460" y="88" fill="#E2E8F0" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="800" font-size="34" text-anchor="middle">${escapeXml(t2)}</text>`
            : ''
        }

        <!-- Preços DE / POR -->
        <g transform="translate(0, ${t2 ? 160 : 120})">
          <text x="460" y="0" fill="#94A3B8" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="700" font-size="30" text-anchor="middle" text-decoration="line-through">
            ${escapeXml(priceDe)}
          </text>
          <text x="460" y="66" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="68" text-anchor="middle" filter="url(#goldGlow)">
            ${escapeXml(pricePor)}
          </text>
        </g>

        <!-- Cupom se houver -->
        ${
          coupon
            ? `
          <g transform="translate(260, ${t2 ? 280 : 240})">
            <rect width="400" height="54" rx="18" fill="#090E1A" stroke="#F59E0B" stroke-width="2"/>
            <text x="200" y="35" fill="#FBBF24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="800" font-size="24" text-anchor="middle">
              🎟️ CUPOM: ${escapeXml(coupon)}
            </text>
          </g>
        `
            : ''
        }
      </g>

      <!-- ================= BOTÃO / ADESIVO DE AÇÃO ================= -->
      <g transform="translate(140, 1560)">
        <rect width="800" height="106" rx="32" fill="#000" fill-opacity="0.5" y="6"/>
        <rect width="800" height="106" rx="32" fill="url(#goldButton)"/>
        <text x="400" y="66" fill="#090E1A" font-family="system-ui, -apple-system, Roboto, sans-serif" font-weight="900" font-size="34" text-anchor="middle" letter-spacing="1">
          👉 COMPRE DIRETO NO LINK
        </text>
      </g>

      <!-- ================= IDENTIFICADOR E RODAPÉ ================= -->
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

  // Composição
  const finalStory = await sharp(Buffer.from(svg))
    .composite([
      { input: logoBuffer, top: 160, left: 80 },
      { input: productBuffer, top: productCardY, left: productCardX },
    ])
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();

  fs.writeFileSync('test_story_gold_9_16.jpg', finalStory);
  console.log('✔ Story 9:16 gerado com sucesso! Tamanho:', Math.round(finalStory.length / 1024), 'KB');
}

renderTestStory().catch(console.error);
