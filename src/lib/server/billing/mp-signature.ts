import crypto from 'crypto';

/**
 * Valida o cabeçalho x-signature das notificações do Mercado Pago.
 * Manifesto oficial: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (data.id em minúsculas se alfanumérico),
 * HMAC-SHA256 com a assinatura secreta da aplicação; compara com v1.
 */
export function verifyMercadoPagoSignature(input: {
  signature: string | null | undefined;
  requestId: string | null | undefined;
  dataId: string | null | undefined;
  secret: string | null | undefined;
}): boolean {
  const secret = String(input.secret || '').trim();
  if (!secret || !input.signature) return false;
  const parts = Object.fromEntries(
    String(input.signature)
      .split(',')
      .map(p => p.split('=').map(s => s.trim()))
      .filter(kv => kv.length === 2)
  ) as Record<string, string>;
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  let manifest = '';
  const dataId = String(input.dataId || '').trim();
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
