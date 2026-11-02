const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const targetCanvasSize = 1080;
const maxSafeInner = 840;

async function buildWatermarkBadge() {
  const width = 310;
  const height = 48;
  const iconSize = 36;

  const circleMask = Buffer.from(
    `<svg width="${iconSize}" height="${iconSize}"><circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="${iconSize / 2}" fill="#fff"/></svg>`
  );

  const circularIcon = await sharp('public/radar-logo.jpg')
    .resize(iconSize, iconSize, { fit: 'cover' })
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

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
      <text x="52" y="30" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="14.5" font-weight="700" fill="#FFFFFF" letter-spacing="0.3">
        <tspan fill="#FBBF24">@</tspan>radar.ofertas.br1
      </text>
    </svg>
  `);

  return sharp(svgBadge)
    .composite([{ input: circularIcon, top: 6, left: 7 }])
    .png()
    .toBuffer();
}

async function renderCategory(categoryName, originalSvg, artifactDir) {
  const originalPng = await sharp(Buffer.from(originalSvg)).png().toBuffer();

  // 1. Auto-trim
  let trimmedBuffer = originalPng;
  try {
    trimmedBuffer = await sharp(originalPng)
      .trim({ background: '#FFFFFF', threshold: 12 })
      .toBuffer();
  } catch {
    trimmedBuffer = originalPng;
  }

  // 2. Redimensionamento adaptativo 'contain' com Lanczos3 + Sharpen
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

  const topPos = Math.round((targetCanvasSize - innerH) / 2);
  const leftPos = Math.round((targetCanvasSize - innerW) / 2);

  // 3. Marca d'água oficial no canto inferior direito
  const badge = await buildWatermarkBadge();
  const badgeMeta = await sharp(badge).metadata();
  const bW = badgeMeta.width || 310;
  const bH = badgeMeta.height || 48;

  const badgeTop = targetCanvasSize - bH - 24;
  const badgeLeft = targetCanvasSize - bW - 28;

  // 4. Montar tela 1080x1080 com fundo branco e exportar JPEG 92%
  const outputJpeg = await sharp({
    create: {
      width: targetCanvasSize,
      height: targetCanvasSize,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: innerBuffer, top: topPos, left: leftPos },
      { input: badge, top: badgeTop, left: badgeLeft },
    ])
    .jpeg({
      quality: 92,
      chromaSubsampling: '4:4:4',
      progressive: false,
      mozjpeg: true,
    })
    .toBuffer();

  const outputPath = path.join(artifactDir, `previa_1080_${categoryName}.jpg`);
  fs.writeFileSync(outputPath, outputJpeg);
  console.log(`✔ Categoria ${categoryName} gerada com sucesso: ${outputPath} (1080x1080, ${Math.round(outputJpeg.length / 1024)} KB)`);
  return outputPath;
}

async function main() {
  const artifactDir = path.resolve('C:/Users/Muryllo Hc/.gemini/antigravity/brain/7ccf940d-0b42-4c3a-8fdf-80b79081094b');
  console.log('Gerando prévias padronizadas 1080x1080 em:', artifactDir);

  // 1. Tênis e Calçados (horizontal largo 1200x550)
  await renderCategory('tenis_calcados', `
    <svg width="1200" height="550" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="550" fill="#FFFFFF"/>
      <path d="M 100 420 Q 240 470 500 460 Q 820 470 1100 390 Q 1140 360 1060 280 Q 980 180 800 160 Q 720 140 640 260 Q 500 260 320 310 Q 160 320 100 420 Z" fill="#2563EB"/>
      <path d="M 180 410 Q 420 430 840 400 Q 1060 370 1080 340" stroke="#F59E0B" stroke-width="16" fill="none"/>
      <circle cx="980" cy="300" r="22" fill="#FFFFFF"/>
      <text x="350" y="380" font-family="sans-serif" font-size="42" font-weight="bold" fill="#FFFFFF">TÊNIS ESPORTIVO ULTRA</text>
    </svg>
  `, artifactDir);

  // 2. Smartphones (vertical longo 600x1200)
  await renderCategory('smartphones', `
    <svg width="600" height="1200" xmlns="http://www.w3.org/2000/svg">
      <rect width="600" height="1200" fill="#FFFFFF"/>
      <rect x="120" y="140" width="360" height="820" rx="46" fill="#0F172A" stroke="#38BDF8" stroke-width="6"/>
      <rect x="140" y="160" width="320" height="780" rx="36" fill="#1E293B"/>
      <circle cx="300" cy="200" r="12" fill="#0284C7"/>
      <text x="170" y="540" font-family="sans-serif" font-size="32" font-weight="bold" fill="#38BDF8">GALAXY S24 ULTRA</text>
    </svg>
  `, artifactDir);

  // 3. Televisores e Monitores (panorâmico 16:9 1280x720)
  await renderCategory('televisores_monitores', `
    <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="720" fill="#FFFFFF"/>
      <rect x="120" y="100" width="1040" height="500" rx="12" fill="#1E293B" stroke="#64748B" stroke-width="8"/>
      <rect x="140" y="120" width="1000" height="460" fill="#0284C7"/>
      <rect x="580" y="600" width="120" height="80" fill="#475569"/>
      <rect x="480" y="670" width="320" height="20" rx="8" fill="#334155"/>
      <text x="380" y="360" font-family="sans-serif" font-size="48" font-weight="bold" fill="#FFFFFF">SMART TV 65" 4K UHD</text>
    </svg>
  `, artifactDir);

  // 4. Relógios e Acessórios (quadrado 900x900)
  await renderCategory('relogios_acessorios', `
    <svg width="900" height="900" xmlns="http://www.w3.org/2000/svg">
      <rect width="900" height="900" fill="#FFFFFF"/>
      <rect x="375" y="120" width="150" height="660" rx="20" fill="#334155"/>
      <circle cx="450" cy="450" r="220" fill="#0F172A" stroke="#F59E0B" stroke-width="14"/>
      <circle cx="450" cy="450" r="180" fill="#1E293B"/>
      <line x1="450" y1="450" x2="450" y2="330" stroke="#F59E0B" stroke-width="8" stroke-linecap="round"/>
      <line x1="450" y1="450" x2="540" y2="450" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
      <text x="320" y="560" font-family="sans-serif" font-size="28" font-weight="bold" fill="#F8FAFC">SMARTWATCH PRO</text>
    </svg>
  `, artifactDir);

  // 5. Roupas (vertical 800x1100)
  await renderCategory('roupas_moda', `
    <svg width="800" height="1100" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="1100" fill="#FFFFFF"/>
      <path d="M 280 180 Q 400 240 520 180 L 720 280 L 640 420 L 550 360 L 550 940 L 250 940 L 250 360 L 160 420 L 80 280 Z" fill="#047857"/>
      <text x="270" y="580" font-family="sans-serif" font-size="34" font-weight="bold" fill="#FFFFFF">CAMISETA DRY FIT</text>
    </svg>
  `, artifactDir);

  // 6. Ferramentas (horizontal 1100x700)
  await renderCategory('ferramentas', `
    <svg width="1100" height="700" xmlns="http://www.w3.org/2000/svg">
      <rect width="1100" height="700" fill="#FFFFFF"/>
      <rect x="250" y="240" width="480" height="260" rx="20" fill="#DC2626"/>
      <polygon points="730,280 920,330 920,410 730,460" fill="#4B5563"/>
      <rect x="920" y="355" width="120" height="30" rx="4" fill="#9CA3AF"/>
      <rect x="360" y="470" width="140" height="180" rx="16" fill="#1F2937"/>
      <text x="300" y="380" font-family="sans-serif" font-size="36" font-weight="bold" fill="#FFFFFF">PARAFUSADEIRA 20V</text>
    </svg>
  `, artifactDir);

  // 7. Eletrodomésticos (quadrado 950x950)
  await renderCategory('eletrodomesticos', `
    <svg width="950" height="950" xmlns="http://www.w3.org/2000/svg">
      <rect width="950" height="950" fill="#FFFFFF"/>
      <rect x="220" y="160" width="510" height="660" rx="38" fill="#111827" stroke="#94A3B8" stroke-width="8"/>
      <circle cx="475" cy="360" r="120" fill="#1E293B" stroke="#F59E0B" stroke-width="6"/>
      <text x="430" y="375" font-family="sans-serif" font-size="40" font-weight="bold" fill="#F59E0B">200°C</text>
      <rect x="290" y="540" width="370" height="220" rx="20" fill="#1F2937"/>
      <rect x="430" y="610" width="90" height="30" rx="8" fill="#F8FAFC"/>
      <text x="340" y="865" font-family="sans-serif" font-size="28" font-weight="bold" fill="#1E293B">FRITADEIRA AIR FRYER 4L</text>
    </svg>
  `, artifactDir);

  console.log('Todas as 7 categorias foram processadas com enquadramento 1080x1080 e marca d\'água oficial!');
}

main().catch(console.error);
