import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function isPrivateAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (isIP(host) === 6) {
    if (host.startsWith('::ffff:')) return isPrivateAddress(host.slice(7));
    return host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  }
  return false;
}

function isPrivateName(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal');
}

type Lookup = (hostname: string) => Promise<string[]>;
const defaultLookup: Lookup = async hostname => (await dnsLookup(hostname, { all: true })).map(entry => entry.address);

async function assertPublicUrl(raw: string, lookup: Lookup): Promise<URL> {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('Endereço da foto do produto não permitido.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateName(parsed.hostname)) {
    throw new Error('Endereço da foto do produto não permitido.');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : await lookup(host).catch(() => [] as string[]);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('Endereço da foto do produto não permitido.');
  return parsed;
}

/**
 * Baixa a foto do produto com limites: só http(s) que resolve para IP público (inclusive após
 * redirecionamentos), tempo máximo e tamanho máximo controlado durante o download.
 */
export async function fetchProductImage(url: string, options: { lookup?: Lookup } = {}): Promise<Buffer> {
  const lookup = options.lookup || defaultLookup;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = await assertPublicUrl(url, lookup);
  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetch(current.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RadarOfertasArt/1.0)', Accept: 'image/*' },
      signal, redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (hop === MAX_REDIRECTS) throw new Error('A foto do produto redireciona vezes demais.');
      current = await assertPublicUrl(new URL(response.headers.get('location')!, current).href, lookup);
      continue;
    }
    break;
  }
  if (!response || !response.ok) throw new Error(`Não foi possível carregar a foto do produto (HTTP ${response?.status ?? 0}).`);
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('A foto do produto é grande demais.');
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error('A foto do produto é grande demais.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
