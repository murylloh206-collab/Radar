import { stripChannelSrcParam } from '../offer-format';

/**
 * Trava de conteúdo das ofertas: nenhuma publicação automática sai sem link, sem preço
 * ou com título inválido (texto de ícone, vazio, genérico). Falhou → revisão manual.
 */

// Palavras que, sozinhas, indicam texto de interface lido da página em vez do nome do produto.
const UI_WORDS = new Set(['shopping', 'cart', 'icon', 'icone', 'logo', 'image', 'imagem', 'loading', 'carregando',
  'carrinho', 'de', 'compras', 'svg', 'png', 'banner']);

const normalizeWord = (word: string) => word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Título inválido: vazio, curto demais ou composto só de palavras de interface ("Shopping Cart Icon", "Ícone"). */
export function isJunkProductTitle(title?: string): boolean {
  const clean = (title || '').trim();
  if (clean.length < 5) return true;
  const words = clean.split(/[\s\-_|/]+/).filter(Boolean).map(normalizeWord);
  return words.length <= 4 && words.every(word => UI_WORDS.has(word));
}

export type OfferContentCheck = { ok: true } | { ok: false; reason: string };

const PRICE = /R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g;

function hasPositivePrice(text: string): boolean {
  return [...text.matchAll(PRICE)].some(match => Number(match[1].replace(/\./g, '').replace(',', '.')) > 0);
}

export function checkOfferContent(input: { messageText: string; displayUrl?: string; title?: string; currentPrice?: number }): OfferContentCheck {
  const text = input.messageText || '';
  if (!/https?:\/\/\S+/i.test(text)) {
    return { ok: false, reason: 'Mensagem sem link de compra. Confira se o modelo da origem tem o campo {link}.' };
  }
  if (input.displayUrl && !text.includes(input.displayUrl) && !text.includes(stripChannelSrcParam(input.displayUrl))) {
    return { ok: false, reason: 'O link de afiliado convertido não aparece no texto final da mensagem.' };
  }
  if (!hasPositivePrice(text) || ('currentPrice' in input && !(Number(input.currentPrice) > 0))) {
    return { ok: false, reason: 'Mensagem sem preço da oferta. Envio automático bloqueado para revisão.' };
  }
  if ('title' in input && isJunkProductTitle(input.title)) {
    return { ok: false, reason: `Título do produto inválido ("${(input.title || '').slice(0, 40)}"). Envio automático bloqueado para revisão.` };
  }
  return { ok: true };
}
