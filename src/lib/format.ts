/** Funções de formatação usadas na interface. */

export function formatPrice(value: number, currency = "BRL"): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * As miniaturas do Mercado Livre vêm pequenas (sufixo "-I").
 * O sufixo "-O" é a versão maior da MESMA imagem no CDN oficial.
 */
export function largerThumbnail(url: string | null): string | null {
  if (!url) return null;
  const secure = url.replace(/^http:\/\//i, "https://");
  return secure.replace(/-I\.(jpg|jpeg|png|webp)$/i, "-O.$1");
}
