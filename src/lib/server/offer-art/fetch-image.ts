import { isIP } from 'node:net';

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 8000;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (isIP(host) === 6) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host.startsWith('::ffff:');
  return false;
}

/** Baixa a foto do produto com limites: só http(s) público, tempo máximo e tamanho máximo. */
export async function fetchProductImage(url: string): Promise<Buffer> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Endereço da foto do produto inválido.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateHost(parsed.hostname)) {
    throw new Error('Endereço da foto do produto não permitido.');
  }
  const response = await fetch(parsed.href, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RadarOfertasArt/1.0)', Accept: 'image/*' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Não foi possível carregar a foto do produto (HTTP ${response.status}).`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) throw new Error('A foto do produto é grande demais.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error('A foto do produto é grande demais.');
  return buffer;
}
