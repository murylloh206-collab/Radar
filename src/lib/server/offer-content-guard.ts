/**
 * Trava de conteúdo das ofertas: nenhuma publicação automática sai sem link, sem preço
 * ou com título inválido (texto de ícone, vazio, genérico). Falhou → revisão manual.
 */

const JUNK_TITLE = /\b(icon|ícone|icone|logo|shopping cart|carrinho de compras|imagem|image|loading|carregando)\b/i;

export function isJunkProductTitle(title?: string): boolean {
  const clean = (title || '').trim();
  return clean.length < 5 || JUNK_TITLE.test(clean);
}

export type OfferContentCheck = { ok: true } | { ok: false; reason: string };

export function checkOfferContent(input: { messageText: string; displayUrl?: string; title?: string }): OfferContentCheck {
  const text = input.messageText || '';
  if (!/https?:\/\/\S+/i.test(text)) {
    return { ok: false, reason: 'Mensagem sem link de compra. Confira se o modelo da origem tem o campo {link}.' };
  }
  if (input.displayUrl && !text.includes(input.displayUrl)) {
    return { ok: false, reason: 'O link de afiliado convertido não aparece no texto final da mensagem.' };
  }
  const prices = [...text.matchAll(/R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g)]
    .map(match => Number(match[1].replace(/\./g, '').replace(',', '.')));
  if (!prices.some(value => value > 0)) {
    return { ok: false, reason: 'Mensagem sem preço da oferta. Envio automático bloqueado para revisão.' };
  }
  if ('title' in input && isJunkProductTitle(input.title)) {
    return { ok: false, reason: `Título do produto inválido ("${(input.title || '').slice(0, 40)}"). Envio automático bloqueado para revisão.` };
  }
  return { ok: true };
}
