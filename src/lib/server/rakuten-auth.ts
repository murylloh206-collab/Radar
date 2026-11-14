import 'server-only';

// Autenticação da API da Rakuten Advertising (guia oficial "Access Tokens"):
// token-key = base64(client_id:client_secret); POST /token com Bearer token-key e scope=SID.
// O access token vale 3600 s; renovamos com 5 min de folga.

export interface RakutenCredentials {
  clientId: string;
  clientSecret: string;
  sid: string;
}

export class RakutenAuthError extends Error {
  constructor(message: string, public code: 'credenciais_invalidas' | 'indisponivel') {
    super(message);
    this.name = 'RakutenAuthError';
  }
}

const TOKEN_URL = 'https://api.linksynergy.com/token';
const SAFETY_MS = 5 * 60_000;
const cache = new Map<string, { token: string; expiresAt: number }>();

export function clearRakutenTokenCache(): void {
  cache.clear();
}

export function buildRakutenTokenKey(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export async function getRakutenAccessToken(
  c: RakutenCredentials,
  opts: { forceRefresh?: boolean; now?: () => number } = {}
): Promise<string> {
  const now = opts.now || Date.now;
  const key = `${c.clientId}:${c.sid}`;
  const cached = cache.get(key);
  if (!opts.forceRefresh && cached && cached.expiresAt - SAFETY_MS > now()) return cached.token;

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${buildRakutenTokenKey(c.clientId.trim(), c.clientSecret.trim())}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ scope: c.sid.trim() }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new RakutenAuthError('Não foi possível falar com a Rakuten agora.', 'indisponivel');
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    cache.delete(key);
    throw new RakutenAuthError('Client ID, Client Secret ou SID da Rakuten inválidos.', 'credenciais_invalidas');
  }
  if (!res.ok) throw new RakutenAuthError(`A Rakuten respondeu HTTP ${res.status}.`, 'indisponivel');
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new RakutenAuthError('A Rakuten não devolveu o token.', 'indisponivel');
  cache.set(key, { token: data.access_token, expiresAt: now() + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token;
}

export async function rakutenFetch(c: RakutenCredentials, url: string, init: RequestInit): Promise<Response> {
  const call = async (token: string) =>
    fetch(url, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers as any), Authorization: `Bearer ${token}` },
    });
  const first = await call(await getRakutenAccessToken(c));
  if (first.status !== 401) return first;
  return call(await getRakutenAccessToken(c, { forceRefresh: true }));
}

export async function findNetshoesAdvertiserId(c: RakutenCredentials): Promise<string | null> {
  const res = await rakutenFetch(c, 'https://api.linksynergy.com/v2/advertisers', { method: 'GET', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => null);
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.advertisers) ? data.advertisers : [];
  const found = list.find(a => /netshoes/i.test(String(a?.name || '')));
  return found?.id != null ? String(found.id) : null;
}
