import { StoreName } from '../types';

export interface ResolveResult {
  originalUrl: string;
  finalUrl: string;
  store: StoreName | null;
  error?: string;
  redirectChain: string[];
}

const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isPrivateOrLocalHost(hostname: string): boolean {
  return BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function detectStoreFromUrl(urlStr: string): StoreName | null {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();

    if (host.includes('mercadolivre.com') || host.includes('mercadolivre.com.br') || host.includes('meli.la') || host.includes('produto.mercadolivre.com.br')) {
      return 'mercadolivre';
    }
    if (host.includes('shopee.com.br') || host.includes('shope.ee') || host.includes('s.shopee.com.br')) {
      return 'shopee';
    }
    if (host.includes('netshoes.com.br') || host.includes('zattini.com.br') || host.includes('linksynergy.com')) {
      return 'netshoes';
    }
    if (host.includes('amazon.com.br') || host.includes('amazon.com') || host.includes('amzn.to') || host.includes('a.co')) {
      return 'amazon';
    }
    if (host.includes('magazineluiza.com.br') || host.includes('magalu.me') || host.includes('mglu.io')) {
      return 'magalu';
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveUrlSafely(
  inputUrl: string,
  maxRedirects = 5,
  timeoutMs = 5000
): Promise<ResolveResult> {
  let currentUrl = inputUrl.trim();
  const redirectChain: string[] = [currentUrl];

  for (let step = 0; step < maxRedirects; step++) {
    let parsedUrl: URL;
    try {
      if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
        currentUrl = 'https://' + currentUrl;
      }
      parsedUrl = new URL(currentUrl);
    } catch {
      return {
        originalUrl: inputUrl,
        finalUrl: currentUrl,
        store: null,
        error: 'URL inválida ou malformada',
        redirectChain,
      };
    }

    // Proteção contra SSRF e IPs internos
    if (isPrivateOrLocalHost(parsedUrl.hostname)) {
      return {
        originalUrl: inputUrl,
        finalUrl: currentUrl,
        store: null,
        error: 'Acesso bloqueado: destino interno ou privado proibido',
        redirectChain,
      };
    }

    // Apenas protocolos HTTP/HTTPS
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        originalUrl: inputUrl,
        finalUrl: currentUrl,
        store: null,
        error: `Protocolo ${parsedUrl.protocol} não permitido`,
        redirectChain,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });

      clearTimeout(timer);

      // Checar se há cabeçalho de redirecionamento (301, 302, 303, 307, 308)
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (location) {
          const nextUrl = new URL(location, currentUrl).toString();
          if (redirectChain.includes(nextUrl)) {
            // Loop detectado
            break;
          }
          currentUrl = nextUrl;
          redirectChain.push(currentUrl);
          continue;
        }
      }

      // Se não houve redirect no HEAD ou retornou 200/405, terminamos
      break;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Fallback: se HEAD der timeout ou método não suportado, mantemos a URL atual
      if (step === 0) {
        return {
          originalUrl: inputUrl,
          finalUrl: currentUrl,
          store: detectStoreFromUrl(currentUrl),
          error: `Falha na resolução da URL: ${message}`,
          redirectChain,
        };
      }
      break;
    }
  }

  const detectedStore = detectStoreFromUrl(currentUrl);

  return {
    originalUrl: inputUrl,
    finalUrl: currentUrl,
    store: detectedStore,
    redirectChain,
  };
}
