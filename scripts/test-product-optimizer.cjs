const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Teste de criação e renderização do pipeline inteligente
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

async function processProductImage(inputBuffer, options = { watermark: true }) {
  const targetCanvasSize = 1080;
  // Área útil segura para o produto: 840x840 px (ocupa ~78% da área, garantindo 120px de respiro anti-corte no WhatsApp)
  const maxSafeInner = 840;

  // 1. Tentar auto-trim suave para remover margens brancas desiguais pré-existentes da foto do fabricante
  let trimmedBuffer = inputBuffer;
  try {
    trimmedBuffer = await sharp(inputBuffer)
      .trim({ background: '#FFFFFF', threshold: 15 })
      .toBuffer();
  } catch {
    trimmedBuffer = inputBuffer;
  }

  // 2. Redimensionamento proporcional (contain / inside) com Lanczos3 de alta precisão
  const innerProduct = await sharp(trimmedBuffer)
    .resize(maxSafeInner, maxSafeInner, {
      fit: 'inside',
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .sharpen({ sigma: 1.0, m1: 0.65, m2: 0.35 })
    .toBuffer();

  const innerMeta = await sharp(innerProduct).metadata();
  const innerW = innerMeta.width || maxSafeInner;
  const innerH = innerMeta.height || maxSafeInner;

  // 3. Centralizar no canvas 1080x1080
  const topPos = Math.round((targetCanvasSize - innerH) / 2);
  const leftPos = Math.round((targetCanvasSize - innerW) / 2);

  const compositeLayers = [
    {
      input: innerProduct,
      top: topPos,
      left: leftPos,
    },
  ];

  // 4. Marca d'água elegante na margem inferior
  if (options.watermark !== false) {
    const badge = await buildWatermarkBadge();
    const badgeMeta = await sharp(badge).metadata();
    const bW = badgeMeta.width || 310;
    const bH = badgeMeta.height || 48;

    // Posiciona na margem inferior com folga segura
    const badgeTop = targetCanvasSize - bH - 24; // 1008
    const badgeLeft = targetCanvasSize - bW - 28; // 742 (canto inferior direito elegante)

    compositeLayers.push({
      input: badge,
      top: badgeTop,
      left: badgeLeft,
    });
  }

  // 5. Montar canvas final em fundo branco puro e exportar JPEG 92% com chroma 4:4:4
  return sharp({
    create: {
      width: targetCanvasSize,
      height: targetCanvasSize,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(compositeLayers)
    .jpeg({
      quality: 92,
      chromaSubsampling: '4:4:4',
      progressive: false,
      mozjpeg: true,
    })
    .toBuffer();
}

async function runTests() {
  console.log('Iniciando testes de categorias reais...');

  // Teste 1: Imagem horizontal (ex: tênis ou calçado)
  // Vamos criar um dummy de tênis horizontal 1200x600 sobre fundo branco
  const dummyTenisSvg = Buffer.from(`
    <svg width="1200" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="600" fill="#FFFFFF"/>
      <!-- Silhueta estilizada de calçado esportivo -->
      <path d="M 150 480 Q 250 510 500 500 Q 800 510 1050 450 Q 1080 430 1050 350 Q 980 250 820 220 Q 750 200 680 320 Q 550 320 380 370 Q 220 380 150 480 Z" fill="#2563EB"/>
      <path d="M 200 470 Q 400 480 800 460 Q 1020 440 1040 420" stroke="#F59E0B" stroke-width="14" fill="none"/>
      <circle cx="950" cy="360" r="18" fill="#F8FAFC"/>
      <text x="450" y="440" font-family="sans-serif" font-size="36" font-weight="bold" fill="#FFFFFF">CALÇADO ESPORTIVO</text>
    </svg>
  `);
  const tenisInput = await sharp(dummyTenisSvg).png().toBuffer();
  const tenisOutput = await processProductImage(tenisInput);
  fs.writeFileSync('test_output_tenis_1080.jpg', tenisOutput);
  console.log('✔ Teste 1 (Tênis - Horizontal) concluído! Saída gerada em test_output_tenis_1080.jpg');

  // Teste 2: Imagem vertical (ex: Smartphone ou Garrafa)
  const dummyPhoneSvg = Buffer.from(`
    <svg width="600" height="1200" xmlns="http://www.w3.org/2000/svg">
      <rect width="600" height="1200" fill="#FFFFFF"/>
      <rect x="120" y="150" width="360" height="780" rx="42" fill="#1E293B" stroke="#0EA5E9" stroke-width="6"/>
      <rect x="140" y="170" width="320" height="740" rx="32" fill="#0F172A"/>
      <circle cx="300" cy="200" r="10" fill="#38BDF8"/>
      <text x="180" y="520" font-family="sans-serif" font-size="28" font-weight="bold" fill="#38BDF8">SMARTPHONE 5G</text>
    </svg>
  `);
  const phoneInput = await sharp(dummyPhoneSvg).png().toBuffer();
  const phoneOutput = await processProductImage(phoneInput);
  fs.writeFileSync('test_output_phone_1080.jpg', phoneOutput);
  console.log('✔ Teste 2 (Smartphone - Vertical) concluído! Saída gerada em test_output_phone_1080.jpg');

  // Teste 3: Ferramenta / Eletrodoméstico
  const dummyToolSvg = Buffer.from(`
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="800" fill="#FFFFFF"/>
      <rect x="180" y="240" width="440" height="300" rx="16" fill="#DC2626"/>
      <polygon points="400,160 520,240 280,240" fill="#1F2937"/>
      <circle cx="400" cy="390" r="80" fill="#F3F4F6" stroke="#991B1B" stroke-width="12"/>
      <text x="240" y="398" font-family="sans-serif" font-size="26" font-weight="bold" fill="#FFFFFF">FURADEIRA 750W</text>
    </svg>
  `);
  const toolInput = await sharp(dummyToolSvg).png().toBuffer();
  const toolOutput = await processProductImage(toolInput);
  fs.writeFileSync('test_output_tool_1080.jpg', toolOutput);
  console.log('✔ Teste 3 (Ferramenta - Quadrado) concluído! Saída gerada em test_output_tool_1080.jpg');

  // Validar dimensões das saídas geradas
  for (const file of ['test_output_tenis_1080.jpg', 'test_output_phone_1080.jpg', 'test_output_tool_1080.jpg']) {
    const meta = await sharp(file).metadata();
    console.log(`Dimensões de ${file}: ${meta.width}x${meta.height}, canais: ${meta.channels}, formato: ${meta.format}`);
  }
}

runTests().catch(console.error);

