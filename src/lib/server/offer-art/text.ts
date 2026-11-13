import fs from 'node:fs';
import path from 'node:path';
import { parse as parseOpentypeFont, type Font } from 'opentype.js';
import { safeCommandsToSvgPath } from '../watermark-vector';

/**
 * Texto da arte convertido em vetor a partir da fonte Inter embutida (assets/fonts, licença OFL).
 * Não depende de fontes instaladas no servidor (a Vercel não tem): nunca gera <text>.
 */

export type FontWeight = 500 | 700 | 800;

const fonts = new Map<FontWeight, Font>();

function font(weight: FontWeight): Font {
  const cached = fonts.get(weight);
  if (cached) return cached;
  const file = path.join(process.cwd(), 'assets', 'fonts', `Inter-${weight}.ttf`);
  const buf = fs.readFileSync(file);
  const parsed = parseOpentypeFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  fonts.set(weight, parsed);
  return parsed;
}

/** Remove caracteres que a fonte não tem (emojis etc.) para não gerar “quadradinhos”. */
function printable(text: string, weight: FontWeight): string {
  const f = font(weight);
  return Array.from(String(text || ''))
    .filter(ch => ch === ' ' || f.charToGlyphIndex(ch) > 0)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Posiciona glifo a glifo (com kerning), sem o motor de substituição do opentype.js, que falha com a Inter. */
function layout(text: string, size: number, weight: FontWeight, letterSpacing: number) {
  const f = font(weight);
  const scale = size / f.unitsPerEm;
  const glyphs = Array.from(text).map(ch => f.charToGlyph(ch));
  const positions: number[] = [];
  let cursor = 0;
  glyphs.forEach((glyph, i) => {
    positions.push(cursor);
    cursor += (glyph.advanceWidth || 0) * scale + letterSpacing;
    if (i < glyphs.length - 1) cursor += f.getKerningValue(glyph, glyphs[i + 1]) * scale;
  });
  return { glyphs, positions, width: Math.max(cursor - (glyphs.length ? letterSpacing : 0), 0) };
}

export function measureText(text: string, size: number, weight: FontWeight, letterSpacing = 0): number {
  return layout(printable(text, weight), size, weight, letterSpacing).width;
}

export interface TextOptions {
  x: number;
  y: number; // linha de base
  size: number;
  weight: FontWeight;
  fill: string;
  anchor?: 'start' | 'middle' | 'end';
  letterSpacing?: number;
  opacity?: number;
}

export function textPath(text: string, opts: TextOptions): { svg: string; width: number } {
  const clean = printable(text, opts.weight);
  const spacing = opts.letterSpacing || 0;
  const width = measureText(clean, opts.size, opts.weight, spacing);
  const startX = opts.anchor === 'middle' ? opts.x - width / 2 : opts.anchor === 'end' ? opts.x - width : opts.x;
  const placed = layout(clean, opts.size, opts.weight, spacing);
  let d = '';
  placed.glyphs.forEach((glyph, i) => {
    d += safeCommandsToSvgPath(glyph.getPath(startX + placed.positions[i], opts.y, opts.size).commands);
  });
  const opacity = opts.opacity !== undefined && opts.opacity < 1 ? ` fill-opacity="${opts.opacity}"` : '';
  return { svg: `<path d="${d || 'M0 0'}" fill="${opts.fill}"${opacity}/>`, width };
}

/** Quebra o texto pela largura real; a última linha recebe reticências se sobrar texto. */
export function wrapText(text: string, opts: { size: number; weight: FontWeight; maxWidth: number; maxLines: number }): string[] {
  const words = printable(text, opts.weight).split(' ').filter(Boolean);
  const fits = (line: string) => measureText(line, opts.size, opts.weight) <= opts.maxWidth;
  const lines: string[] = [];
  let current = '';
  let index = 0;
  for (; index < words.length; index++) {
    const candidate = current ? `${current} ${words[index]}` : words[index];
    if (fits(candidate)) { current = candidate; continue; }
    if (current) lines.push(current);
    current = words[index];
    if (lines.length === opts.maxLines) break;
  }
  if (lines.length < opts.maxLines && current) { lines.push(current); index = words.length; current = ''; }
  const truncated = index < words.length || lines.length > opts.maxLines;
  const result = lines.slice(0, opts.maxLines);
  if (truncated && result.length) {
    let last = result[result.length - 1];
    while (last && !fits(`${last}…`)) last = last.split(' ').slice(0, -1).join(' ') || last.slice(0, -1);
    result[result.length - 1] = `${last.replace(/[\s,.;:-]+$/, '')}…`;
  }
  // Palavra única maior que a largura: corta por caracteres
  return result.map(line => {
    let out = line;
    while (out.length > 1 && !fits(out)) out = `${out.slice(0, -2)}…`;
    return out;
  });
}
