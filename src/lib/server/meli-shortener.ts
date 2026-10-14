import "server-only";

import { config } from "./config";
import { loadDecryptedSession } from "./session-vault";

/**
 * GERADOR AUTOMÁTICO DE LINKS MELI.LA
 * -----------------------------------
 * Interage com a API interna de afiliados do Mercado Livre para gerar
 * links curtos oficiais no formato https://meli.la/XXXXX.
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function extractCsrfToken(html: string): string | null {
  const metaMatch = html.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i);
  if (metaMatch?.[1]) return metaMatch[1];

  const jsonMatch = html.match(/["']csrfToken["']\s*:\s*["']([^"']+)["']/i);
  if (jsonMatch?.[1]) return jsonMatch[1];

  const csrfMatch = html.match(/["']csrf["']\s*:\s*["']([^"']+)["']/i);
  if (csrfMatch?.[1]) return csrfMatch[1];

  return null;
}

async function attemptShortenUrl(
  productUrl: string,
  cookie: string,
  tag: string
): Promise<{ shortUrl: string | null; error: string | null }> {
  const cleanUrl = productUrl.endsWith("/") ? productUrl.slice(0, -1) : productUrl;

  try {
    let csrfToken = "";
    try {
      const pageRes = await fetch(cleanUrl, {
        headers: {
          Cookie: cookie,
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        cache: "no-store",
      });

      if (pageRes.ok) {
        const html = await pageRes.text();
        csrfToken = extractCsrfToken(html) || "";
      }
    } catch {
      // continua tentando
    }

    if (!csrfToken) {
      const cookieCsrfMatch = cookie.match(/_csrf=([^;]+)/);
      if (cookieCsrfMatch?.[1]) {
        csrfToken = decodeURIComponent(cookieCsrfMatch[1]);
      }
    }

    const endpoint = "https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
        Cookie: cookie,
        Referer: cleanUrl,
        Origin: "https://produto.mercadolivre.com.br",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        url: cleanUrl,
        tag,
      }),
      cache: "no-store",
    });

    const resText = await res.text().catch(() => "");
    if (res.ok) {
      try {
        const data = JSON.parse(resText) as { short_url?: string };
        if (data.short_url && data.short_url.includes("meli.la")) {
          console.log(`[meli.la] Link encurtado com sucesso: ${data.short_url}`);
          return { shortUrl: data.short_url, error: null };
        }
      } catch {
        // ignore
      }
    }

    let errorMsg: string;
    if (res.status === 401) {
      errorMsg = "Sessão do Mercado Livre expirou (401). Atualize o Cookie de Sessão no painel para reativar o encurtamento meli.la.";
    } else {
      errorMsg = `Mercado Livre retornou status ${res.status}`;
    }
    console.warn(`[meli.la] Tentativa para "${cleanUrl}" retornou status ${res.status}: ${resText.slice(0, 150)}`);
    return { shortUrl: null, error: errorMsg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha na requisição";
    return { shortUrl: null, error: msg };
  }
}

/**
 * Tenta gerar um link oficial meli.la para a URL de um produto.
 * Suporta URLs alternativas de fallback se a URL inicial falhar (ex: página de catálogo /p/ vs link direto).
 * Retorna o link https://meli.la/... ou null caso não seja possível.
 */
export async function generateMeliShortLinkDetailed(
  productUrl: string,
  customTag?: string,
  fallbackUrls?: string[],
): Promise<{ shortUrl: string | null; error: string | null }> {
  let cookie = config.mercadoLivre.sessionCookie;
  if (!cookie) {
    const session = await loadDecryptedSession("mercadolivre");
    if (session?.rawCookie) {
      cookie = session.rawCookie;
      config.mercadoLivre.sessionCookie = session.rawCookie;
    }
  }

  if (!cookie) {
    return { shortUrl: null, error: "Sessão do Mercado Livre não configurada ou expirada." };
  }

  const tag = customTag || config.mercadoLivre.affiliateMattWord || "michelhenrique1";
  const urlsToTry = Array.from(new Set([productUrl, ...(fallbackUrls || [])])).filter(Boolean);

  let lastError: string | null = null;
  for (const url of urlsToTry) {
    const result = await attemptShortenUrl(url, cookie, tag);
    if (result.shortUrl) {
      return result;
    }
    lastError = result.error;
  }

  return { shortUrl: null, error: lastError || "Não foi possível obter o link meli.la." };
}

export async function generateMeliShortLink(
  productUrl: string,
  customTag?: string,
  fallbackUrls?: string[],
): Promise<string | null> {
  const result = await generateMeliShortLinkDetailed(productUrl, customTag, fallbackUrls);
  return result.shortUrl;
}
