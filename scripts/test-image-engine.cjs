const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function testBadge() {
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
          <stop offset="0%" stop-color="#0a0f1d" stop-opacity="0.94"/>
          <stop offset="100%" stop-color="#141c2e" stop-opacity="0.94"/>
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="23" ry="23" 
            fill="url(#badgeBg)" stroke="#EAB308" stroke-width="1.5" stroke-opacity="0.85"/>
      <text x="52" y="30" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="14.5" font-weight="700" fill="#FFFFFF" letter-spacing="0.3">
        <tspan fill="#FBBF24">@</tspan>radar.ofertas.br1
      </text>
    </svg>
  `);

  const badge = await sharp(svgBadge)
    .composite([{ input: circularIcon, top: 6, left: 7 }])
    .png()
    .toBuffer();

  fs.writeFileSync('scratch_badge.png', badge);
  console.log('Badge criado com sucesso! Tamanho:', badge.length);
}

testBadge().catch(console.error);

