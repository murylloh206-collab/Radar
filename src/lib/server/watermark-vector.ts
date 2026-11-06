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
  customLogoUrl?: string | null;
  opacity?: number; // 10..100
  scale?: number; // 50..160 (%)
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'custom';
  customX?: number; // 0..100 (%)
  customY?: number; // 0..100 (%)
  targetImageWidth?: number;
  targetImageHeight?: number;
}

export interface WatermarkBadgeResult {
  buffer: Buffer;
  width: number;
  height: number;
  marginRight: number;
  marginBottom: number;
  top: number;
  left: number;
}

async function resolveCustomCircularLogo(logoUrl: string | null | undefined, size: number = 34): Promise<Buffer | null> {
  if (!logoUrl || !logoUrl.trim()) return null;
  try {
    let rawBuf: Buffer | null = null;
    if (logoUrl.startsWith('data:image/')) {
      const base64Part = logoUrl.split(',')[1];
      if (base64Part) rawBuf = Buffer.from(base64Part, 'base64');
    } else if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        rawBuf = Buffer.from(await res.arrayBuffer());
      }
    } else {
      const localPath = logoUrl.startsWith('/')
        ? path.join(process.cwd(), 'public', logoUrl)
        : logoUrl;
      if (fs.existsSync(localPath)) {
        rawBuf = fs.readFileSync(localPath);
      }
    }

    if (!rawBuf) return null;

    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    );

    return await sharp(rawBuf)
      .resize(size, size, { fit: 'cover' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

export function computeWatermarkCoordinates(params: {
  badgeW: number;
  badgeH: number;
  canvasW: number;
  canvasH: number;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'custom';
  customX?: number;
  customY?: number;
}): { top: number; left: number } {
  const { badgeW, badgeH, canvasW, canvasH, position = 'bottom-right', customX = 82, customY = 90 } = params;
  const marginX = 28;
  const marginY = 24;

  let left = canvasW - badgeW - marginX;
  let top = canvasH - badgeH - marginY;

  if (position === 'bottom-left') {
    left = marginX;
    top = canvasH - badgeH - marginY;
  } else if (position === 'top-right') {
    left = canvasW - badgeW - marginX;
    top = marginY;
  } else if (position === 'top-left') {
    left = marginX;
    top = marginY;
  } else if (position === 'center') {
    left = Math.round((canvasW - badgeW) / 2);
    top = Math.round((canvasH - badgeH) / 2);
  } else if (position === 'custom') {
    const centerX = Math.round((Math.max(0, Math.min(100, customX)) / 100) * canvasW);
    const centerY = Math.round((Math.max(0, Math.min(100, customY)) / 100) * canvasH);
    left = Math.max(8, Math.min(canvasW - badgeW - 8, Math.round(centerX - badgeW / 2)));
    top = Math.max(8, Math.min(canvasH - badgeH - 8, Math.round(centerY - badgeH / 2)));
  }

  return {
    top: Math.max(0, Math.min(canvasH - badgeH, top)),
    left: Math.max(0, Math.min(canvasW - badgeW, left)),
  };
}

async function applyScaleAndOpacity(
  baseBuffer: Buffer,
  scalePct: number,
  opacityPct: number
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(baseBuffer).metadata();
  const baseW = meta.width || 280;
  const baseH = meta.height || 59;

  const clampedScale = Math.max(50, Math.min(160, scalePct || 100)) / 100;
  const clampedOpacity = Math.max(10, Math.min(100, opacityPct || 95)) / 100;

  const finalW = Math.max(80, Math.round(baseW * clampedScale));
  const finalH = Math.max(24, Math.round(baseH * clampedScale));

  let pipeline = sharp(baseBuffer).resize(finalW, finalH, { fit: 'contain' }).ensureAlpha();

  if (clampedOpacity < 0.99) {
    const alphaMask = Buffer.from(
      `<svg width="${finalW}" height="${finalH}"><rect width="${finalW}" height="${finalH}" fill="rgba(255,255,255,${clampedOpacity.toFixed(2)})"/></svg>`
    );
    pipeline = pipeline.composite([{ input: alphaMask, blend: 'dest-in' }]);
  }

  const outBuf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  return { buffer: outBuf, width: finalW, height: finalH };
}

/**
 * Obtém ou constrói a marca d'água oficial ou personalizada do Radar de Ofertas:
 * - Quando for a marca padrão (@radar.ofertas.br1 sem logo customizada), utiliza o asset PNG pré-renderizado oficial.
 * - Quando for personalizada (Plus / Ultimate), renderiza a logo do cliente + @ do cliente em caminhos vetoriais puros (<path>) sem depender de fontes do SO, aplicando tamanho, opacidade e posição escolhidos.
 */
export async function getOfficialWatermarkBadge(options: WatermarkBadgeOptions = {}): Promise<WatermarkBadgeResult> {
  const rawHandle = options.handle?.trim() || '@radar.ofertas.br1';
  const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
  const targetImageW = options.targetImageWidth || 1080;
  const targetImageH = options.targetImageHeight || 1080;
  const scale = typeof options.scale === 'number' ? options.scale : 100;
  const opacity = typeof options.opacity === 'number' ? options.opacity : 95;
  const hasCustomLogo = Boolean(options.customLogoUrl && options.customLogoUrl.trim());
  const isDefaultHandle = handle === '@radar.ofertas.br1' && !hasCustomLogo;
  const logoKey = hasCustomLogo ? options.customLogoUrl!.slice(-32) : 'default';
  const cacheKey = `badge_${handle}_${logoKey}_s${scale}_o${opacity}_w${targetImageW}_v5`;

  if (watermarkBadgeCache.has(cacheKey)) {
    const cachedBuf = watermarkBadgeCache.get(cacheKey)!;
    const meta = await sharp(cachedBuf).metadata();
    const bw = meta.width || 280;
    const bh = meta.height || 59;
    const coords = computeWatermarkCoordinates({
      badgeW: bw,
      badgeH: bh,
      canvasW: targetImageW,
      canvasH: targetImageH,
      position: options.position,
      customX: options.customX,
      customY: options.customY,
    });
    return {
      buffer: cachedBuf,
      width: bw,
      height: bh,
      marginRight: 28,
      marginBottom: 24,
      top: coords.top,
      left: coords.left,
    };
  }

  // 1. Tentar carregar o asset PNG permanente pré-renderizado se for o identificador padrão sem logo customizada
  if (isDefaultHandle) {
    for (const candidate of PERMANENT_PNG_CANDIDATES) {
      if (fs.existsSync(candidate)) {
        try {
          const preRenderedBuf = fs.readFileSync(candidate);
          const meta = await sharp(preRenderedBuf).metadata();
          if (meta.width && meta.height) {
            const targetW = Math.round(targetImageW * 0.26);
            const targetH = Math.round((meta.height / meta.width) * targetW);

            const baseResized = await sharp(preRenderedBuf)
              .resize(targetW, targetH, { fit: 'contain' })
              .png()
              .toBuffer();

            const transformed = await applyScaleAndOpacity(baseResized, scale, opacity);
            watermarkBadgeCache.set(cacheKey, transformed.buffer);

            const coords = computeWatermarkCoordinates({
              badgeW: transformed.width,
              badgeH: transformed.height,
              canvasW: targetImageW,
              canvasH: targetImageH,
              position: options.position,
              customX: options.customX,
              customY: options.customY,
            });

            return {
              buffer: transformed.buffer,
              width: transformed.width,
              height: transformed.height,
              marginRight: 28,
              marginBottom: 24,
              top: coords.top,
              left: coords.left,
            };
          }
        } catch (err) {
          console.warn('[Watermark] Falha ao carregar asset permanente, usando fallback vetorial:', err);
        }
      }
    }
  }

  // 2. Geração vetorial sob medida usando caminhos seguros (<path> via opentype.js, sem NaN e sem depender de fontes do SO)
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

  const circularIcon =
    (await resolveCustomCircularLogo(options.customLogoUrl, iconSize)) ||
    (await getOfficialRadarCircularIcon(iconSize));

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

  let rawBadgeBuffer: Buffer;
  if (circularIcon) {
    rawBadgeBuffer = await sharp(svgBadge)
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
    rawBadgeBuffer = await sharp(svgBadge).png().toBuffer();
  }

  const transformed = await applyScaleAndOpacity(rawBadgeBuffer, scale, opacity);
  watermarkBadgeCache.set(cacheKey, transformed.buffer);

  const coords = computeWatermarkCoordinates({
    badgeW: transformed.width,
    badgeH: transformed.height,
    canvasW: targetImageW,
    canvasH: targetImageH,
    position: options.position,
    customX: options.customX,
    customY: options.customY,
  });

  return {
    buffer: transformed.buffer,
    width: transformed.width,
    height: transformed.height,
    marginRight: 28,
    marginBottom: 24,
    top: coords.top,
    left: coords.left,
  };
}
