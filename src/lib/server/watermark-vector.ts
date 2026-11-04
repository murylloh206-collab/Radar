import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseOpentypeFont, type Font } from 'opentype.js';

// Cache do selo da marca d'água em memória
const watermarkBadgeCache = new Map<string, Buffer>();

// Caminhos possíveis para a fonte TrueType Noto Sans Latin embutida no Next.js
const FONT_CANDIDATES = [
  path.join(process.cwd(), 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'noto-sans-v27-latin-regular.ttf'),
  path.join(process.cwd(), 'node_modules', 'next', 'dist', 'next-devtools', 'server', 'font', 'geist-latin.woff2'),
];

// Caminhos possíveis para o asset PNG pré-renderizado permanente
const PERMANENT_PNG_CANDIDATES = [
  path.join(process.cwd(), 'public', 'watermark-radar-official.png'),
  path.join(process.cwd(), 'src', 'assets', 'images', 'watermark-radar-official.png'),
  path.join(process.cwd(), 'public', 'watermark-badge.png'),
];

let parsedFont: Font | null = null;

function getParsedFont(): Font | null {
  if (parsedFont) return parsedFont;
  for (const candidate of FONT_CANDIDATES) {
    try {
      if (fs.existsSync(candidate) && candidate.endsWith('.ttf')) {
        const buf = fs.readFileSync(candidate);
        parsedFont = parseOpentypeFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        return parsedFont;
      }
    } catch {
      // Tentar próximo candidato
    }
  }
  return null;
}

function fontBufferByteLength(buf: Buffer): number {
  return buf.byteLength;
}

/**
 * Converte comandos opentype em SVG path data seguro,
 * contornando o bug numérico de precisão de ponto flutuante do opentype.js
 * que emite NaN em caminhos de curvas com restos infinitesimais (e.g. 203.00000000000003).
 */
export function safeCommandsToSvgPath(commands: any[]): string {
  let d = '';
  for (const c of commands) {
    if (c.type === 'M') {
      d += `M${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
    } else if (c.type === 'L') {
      d += `L${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
    } else if (c.type === 'Q') {
      d += `Q${c.x1.toFixed(2)} ${c.y1.toFixed(2)} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
    } else if (c.type === 'C') {
      d += `C${c.x1.toFixed(2)} ${c.y1.toFixed(2)} ${c.x2.toFixed(2)} ${c.y2.toFixed(2)} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
    } else if (c.type === 'Z') {
      d += 'Z';
    }
  }
  return d;
}

/**
 * Converte qualquer texto de identificador em SVG <path> vetorial puro.
 * Não utiliza tags <text> nem depende do Pango/fontconfig do sistema operacional.
 */
export function convertHandleToVectorPath(text: string, x: number, y: number, fontSize: number): { pathData: string; width: number } {
  const font = getParsedFont();
  if (font) {
    try {
      const pathObj = font.getPath(text, x, y, fontSize);
      const bbox = pathObj.getBoundingBox();
      const textWidth = Math.ceil(bbox.x2 - bbox.x1);
      const pathData = safeCommandsToSvgPath(pathObj.commands);
      return { pathData, width: textWidth };
    } catch {
      // Fallback
    }
  }

  // Se não foi possível carregar o opentype em tempo de execução, usa aproximação segura
  const approxWidth = Math.ceil(text.length * (fontSize * 0.58));
  return { pathData: '', width: approxWidth };
}

/**
 * Extrai o emblema oficial do Radar da imagem do projeto public/radar-logo.jpg
 * com recorte circular de alta fidelidade e canal alfa (PNG transparente).
 */
export async function getOfficialRadarCircularIcon(size: number = 34): Promise<Buffer | null> {
  const candidates = [
    path.join(process.cwd(), 'public', 'radar-logo.jpg'),
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'public', 'icon.png'),
  ];

  let logoFilePath: string | null = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      logoFilePath = c;
      break;
    }
  }

  if (!logoFilePath) return null;

  try {
    const emblemDiameter = 480;
    const emblemLeft = Math.round(512 - emblemDiameter / 2);
    const emblemTop = 105;

    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    );

    return await sharp(logoFilePath)
      .extract({ left: emblemLeft, top: emblemTop, width: emblemDiameter, height: emblemDiameter })
      .resize(size, size, { fit: 'cover' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('[Watermark] Falha ao extrair emblema circular oficial:', err);
    return null;
  }
}

export interface WatermarkBadgeOptions {
  handle?: string;
  targetImageWidth?: number;
  targetImageHeight?: number;
}

export interface WatermarkBadgeResult {
  buffer: Buffer;
  width: number;
  height: number;
  marginRight: number;
  marginBottom: number;
}

/**
 * Obtém ou constrói a marca d'água oficial do Radar de Ofertas:
 * 
 * ESTRATÉGIA PRINCIPAL:
 * - Carrega diretamente o asset PNG pré-renderizado permanente (public/watermark-radar-official.png).
 * - O identificador @radar.ofertas.br1 já faz parte dos pixels nativos da imagem PNG com transparência.
 * - Zero dependência de fontes do sistema operacional e zero conversão dinâmica de texto em tempo de envio.
 * - Redimensiona proporcionalmente para o tamanho ideal da imagem do produto (260px - 280px em 1080x1080).
 */
export async function getOfficialWatermarkBadge(options: WatermarkBadgeOptions = {}): Promise<WatermarkBadgeResult> {
  const rawHandle = options.handle?.trim() || '@radar.ofertas.br1';
  const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
  const targetImageW = options.targetImageWidth || 1080;
  const isDefaultHandle = handle === '@radar.ofertas.br1';
  const cacheKey = `badge_${handle}_w${targetImageW}_v4`;

  if (watermarkBadgeCache.has(cacheKey)) {
    const cachedBuf = watermarkBadgeCache.get(cacheKey)!;
    const meta = await sharp(cachedBuf).metadata();
    return {
      buffer: cachedBuf,
      width: meta.width || 280,
      height: meta.height || 59,
      marginRight: 28,
      marginBottom: 24,
    };
  }

  // 1. Tentar carregar o asset PNG permanente pré-renderizado se for o identificador padrão
  if (isDefaultHandle) {
    for (const candidate of PERMANENT_PNG_CANDIDATES) {
      if (fs.existsSync(candidate)) {
        try {
          const preRenderedBuf = fs.readFileSync(candidate);
          const meta = await sharp(preRenderedBuf).metadata();
          if (meta.width && meta.height) {
            // Proporção ideal de ~26% da largura da imagem de destino (280px para 1080px)
            const targetW = Math.round(targetImageW * 0.26);
            const targetH = Math.round((meta.height / meta.width) * targetW);

            const resizedBuffer = await sharp(preRenderedBuf)
              .resize(targetW, targetH, { fit: 'contain' })
              .png({ compressionLevel: 9 })
              .toBuffer();

            watermarkBadgeCache.set(cacheKey, resizedBuffer);

            return {
              buffer: resizedBuffer,
              width: targetW,
              height: targetH,
              marginRight: 28,
              marginBottom: 24,
            };
          }
        } catch (err) {
          console.warn('[Watermark] Falha ao carregar asset permanente, usando fallback vetorial:', err);
        }
      }
    }
  }

  // 2. Fallback de contingência: Geração vetorial sob medida usando caminhos seguros (sem NaN)
  const fontSize = 17.5;
  const badgeH = 46;
  const iconSize = 34;
  const padLeft = 7;
  const padRight = 16;
  const gapIconSep = 8;
  const gapSepText = 10;
  const sepW = 1;

  const textX = padLeft + iconSize + gapIconSep + sepW + gapSepText;
  const textY = Math.round(badgeH / 2 + fontSize / 2 - 2);
  const sepX = padLeft + iconSize + gapIconSep;

  const { pathData, width: textWidth } = convertHandleToVectorPath(handle, textX, textY, fontSize);
  const badgeW = Math.round(padLeft + iconSize + gapIconSep + sepW + gapSepText + textWidth + padRight);

  const circularIcon = await getOfficialRadarCircularIcon(iconSize);

  const fallbackIconSvg = !circularIcon
    ? `<g transform="translate(${padLeft}, ${Math.round((badgeH - iconSize) / 2)})">
         <circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="${iconSize / 2 - 1}" fill="#0D1B31" stroke="#1CCAF2" stroke-width="1.4"/>
         <circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="${iconSize / 3}" fill="none" stroke="#1CCAF2" stroke-width="1" stroke-opacity="0.6"/>
         <circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="3" fill="#1CCAF2"/>
         <line x1="${iconSize / 2}" y1="${iconSize / 2}" x2="${iconSize - 6}" y2="8" stroke="#1CCAF2" stroke-width="1.4" stroke-linecap="round"/>
       </g>`
    : '';

  const textElementSvg = pathData
    ? `<path d="${pathData}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="0.5" stroke-linejoin="round"/>`
    : `<text x="${textX}" y="${textY}" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="#FFFFFF">${handle}</text>`;

  const svgBadge = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
    <svg width="${badgeW}" height="${badgeH}" viewBox="0 0 ${badgeW} ${badgeH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="badgeBgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#061225" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#0B1A30" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="${badgeW - 1.5}" height="${badgeH - 1.5}" rx="${Math.round(badgeH / 2)}" ry="${Math.round(badgeH / 2)}"
            fill="url(#badgeBgGrad)" stroke="#1CCAF2" stroke-width="1.2" stroke-opacity="0.80"/>
      <line x1="${sepX}" y1="12" x2="${sepX}" y2="${badgeH - 12}" stroke="#1CCAF2" stroke-width="1" stroke-opacity="0.45" stroke-linecap="round"/>
      ${fallbackIconSvg}
      ${textElementSvg}
    </svg>
  `);

  let finalBadgeBuffer: Buffer;
  if (circularIcon) {
    finalBadgeBuffer = await sharp(svgBadge)
      .composite([
        {
          input: circularIcon,
          top: Math.round((badgeH - iconSize) / 2),
          left: padLeft,
        },
      ])
      .png()
      .toBuffer();
  } else {
    finalBadgeBuffer = await sharp(svgBadge).png().toBuffer();
  }

  watermarkBadgeCache.set(cacheKey, finalBadgeBuffer);

  return {
    buffer: finalBadgeBuffer,
    width: badgeW,
    height: badgeH,
    marginRight: 28,
    marginBottom: 24,
  };
}
