/**
 * Paleta da arte gerada a partir de UMA cor escolhida pelo cliente + fundo escuro ou claro.
 * Garante contraste legível: texto ≥ 4.5:1, destaque ≥ 3:1, texto sobre o selo ≥ 4.5:1.
 */

export type ArtBackground = 'dark' | 'light';

export interface ArtTheme {
  mode: ArtBackground;
  background: { top: string; mid: string; bottom: string };
  stage: { top: string; bottom: string; shadow: string };
  text: string;
  textMuted: string;
  accent: string; // cor do selo/chip
  onAccent: string; // texto sobre o selo
  accentText: string; // destaques em texto (preço, cupom) sobre o fundo
  divider: string;
}

const DEFAULT_ACCENT = '#1CCAF2';

type Rgb = [number, number, number];
type Hsl = [number, number, number];

function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec((hex || '').trim());
  if (!match) return null;
  const value = match[1].length === 3 ? match[1].split('').map(c => c + c).join('') : match[1];
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

const toHex = ([r, g, b]: Rgb) => '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const hsl = (h: number, s: number, l: number) => toHex(hslToRgb([((h % 360) + 360) % 360, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l))]));

function luminance(hex: string): number {
  const rgb = parseHex(hex) || [0, 0, 0];
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Ajusta a luminosidade da cor (mantendo matiz) até atingir o contraste mínimo contra o fundo. */
function ensureContrast(color: string, against: string, min: number, direction: 'lighter' | 'darker'): string {
  const [h, s, l] = rgbToHsl(parseHex(color) || [0, 0, 0]);
  let current = color;
  for (let step = 0; step <= 40 && contrastRatio(current, against) < min; step++) {
    const nl = direction === 'lighter' ? l + (1 - l) * (step / 40) : l * (1 - step / 40);
    current = hsl(h, s, nl);
  }
  return contrastRatio(current, against) >= min ? current : direction === 'lighter' ? '#FFFFFF' : '#000000';
}

export function buildArtTheme(accentHex: string, background: ArtBackground): ArtTheme {
  const accent = toHex(parseHex(accentHex) || parseHex(DEFAULT_ACCENT)!);
  const [h, s] = rgbToHsl(parseHex(accent)!);
  const sat = Math.max(s, 0.35);
  const onAccent = contrastRatio('#FFFFFF', accent) >= 4.5 ? '#FFFFFF'
    : contrastRatio('#0B0B12', accent) >= 4.5 ? '#0B0B12' : ensureContrast('#0B0B12', accent, 4.5, 'darker');

  if (background === 'light') {
    const bg = { top: hsl(h, sat * 0.55, 0.975), mid: hsl(h, sat * 0.5, 0.95), bottom: hsl(h, sat * 0.45, 0.91) };
    const text = ensureContrast(hsl(h, sat * 0.5, 0.12), bg.bottom, 4.5, 'darker');
    return {
      mode: 'light', background: bg,
      stage: { top: '#FFFFFF', bottom: hsl(h, sat * 0.3, 0.985), shadow: `rgba(0,0,0,0.12)` },
      text,
      textMuted: ensureContrast(hsl(h, sat * 0.2, 0.42), bg.bottom, 4.5, 'darker'),
      accent, onAccent,
      accentText: ensureContrast(accent, bg.bottom, 3, 'darker'),
      divider: 'rgba(0,0,0,0.10)',
    };
  }

  const bg = { top: hsl(h, sat * 0.62, 0.22), mid: hsl(h, sat * 0.68, 0.11), bottom: hsl(h, sat * 0.7, 0.06) };
  const [r, g, b] = parseHex(accent)!;
  return {
    mode: 'dark', background: bg,
    stage: { top: '#FFFFFF', bottom: hsl(h, sat * 0.35, 0.95), shadow: `rgba(${r},${g},${b},0.28)` },
    text: '#FFFFFF',
    textMuted: ensureContrast(hsl(h, sat * 0.25, 0.75), bg.top, 4.5, 'lighter'),
    accent, onAccent,
    accentText: ensureContrast(accent, bg.top, 3, 'lighter'),
    divider: 'rgba(255,255,255,0.14)',
  };
}
