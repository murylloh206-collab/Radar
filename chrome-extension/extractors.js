/* Leitores puros das páginas das lojas (sem acesso ao DOM: recebem o que foi coletado da aba).
   Usados pelo popup e pelos testes automatizados. Nunca clicam em nada. */

const CLIENT_RE = /^[A-Za-z0-9]{20,64}$/;
const TOKEN_RE = /\b[A-Za-z0-9]{20,64}\b/;
const firstToken = v => (String(v || '').match(TOKEN_RE) || [])[0] || '';

export function extractRakutenCredentials(table) {
  const headers = (table?.headers || []).map(h => String(h || '').trim().toLowerCase());
  const idCol = headers.findIndex(h => h.includes('client id'));
  const secretCol = headers.findIndex(h => h.includes('client secret') || (h.includes('secret') && !h.includes('id')));
  if (idCol < 0 || secretCol < 0) return null;
  for (const row of table?.rows || []) {
    const clientId = firstToken(row?.[idCol]);
    const clientSecret = firstToken(row?.[secretCol]);
    if (CLIENT_RE.test(clientId) && CLIENT_RE.test(clientSecret) && clientId !== clientSecret) return { clientId, clientSecret };
  }
  return null;
}

/** Reserva: sem tabela no DOM, usa o texto — a linha logo após "Client ID … Client Secret" com dois códigos longos. */
export function extractRakutenCredentialsFromText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const h = lines.findIndex(l => /client id/i.test(l) && /client secret/i.test(l));
  if (h < 0) return null;
  for (const line of lines.slice(h + 1, h + 6)) {
    const tokens = line.match(/\b[A-Za-z0-9]{20,64}\b/g) || [];
    if (tokens.length >= 2 && tokens[0] !== tokens[1]) return { clientId: tokens[0], clientSecret: tokens[1] };
  }
  return null;
}

export function extractRakutenSid(text) {
  const m = String(text || '').match(/SID[^\d\n]{0,30}(\d{5,9})\b/);
  return m ? m[1] : null;
}

export function extractShopeeCredentials(text) {
  const t = String(text || '');
  const id = t.match(/AppID:\s*(\d{6,15})\b/);
  const secret = t.match(/Senha:\s*([A-Za-z0-9]{20,64})\b/);
  return id && secret ? { appId: id[1], appSecret: secret[1] } : null;
}

const AMAZON_TAG = /^[a-z0-9][a-z0-9-]{1,60}-2\d$/i;

export function extractAmazonTag(storeIdInputValue, text) {
  const fromInput = String(storeIdInputValue || '').trim();
  if (AMAZON_TAG.test(fromInput)) return fromInput;
  const m = String(text || '').match(/StoreID:\s*([a-z0-9][a-z0-9-]{1,60}-2\d)\b/i);
  return m ? m[1] : null;
}

export function detectStorePage(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === 'developers.rakutenadvertising.com') return 'rakuten_dev';
  if (host === 'publisher.rakutenadvertising.com') return 'rakuten_publisher';
  if (host === 'affiliate.shopee.com.br') return 'shopee';
  if (host === 'associados.amazon.com.br') return 'amazon';
  if (host === 'mercadolivre.com.br' || host.endsWith('.mercadolivre.com.br')) return 'mercadolivre';
  return null;
}
