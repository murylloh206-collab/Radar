/* Leitores puros das páginas das lojas (sem acesso ao DOM: recebem o que foi coletado da aba).
   Usados pelo popup e pelos testes automatizados. Nunca clicam em nada. */

const CLIENT_RE = /^[A-Za-z0-9]{20,64}$/;

export function extractRakutenCredentials(table) {
  const headers = (table?.headers || []).map(h => String(h || '').trim().toLowerCase());
  const idCol = headers.findIndex(h => h === 'client id');
  const secretCol = headers.findIndex(h => h === 'client secret');
  if (idCol < 0 || secretCol < 0) return null;
  for (const row of table?.rows || []) {
    const clientId = String(row?.[idCol] || '').trim();
    const clientSecret = String(row?.[secretCol] || '').trim();
    if (CLIENT_RE.test(clientId) && CLIENT_RE.test(clientSecret)) return { clientId, clientSecret };
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
