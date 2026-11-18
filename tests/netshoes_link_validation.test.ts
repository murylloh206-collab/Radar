import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJobForDispatch } from '../src/lib/server/job-validator';
import { sanitizeStoreUrl } from '../src/lib/server/affiliate-converter';
import type { PublicationJob } from '../src/lib/types';

const USER = '00000000-0000-0000-0000-000000000001';
const murl = encodeURIComponent('https://www.netshoes.com.br/p/tenis-adidas-barreda-masculino-branco-FBA-7432-855');

function db(sessionData: Record<string, unknown> = { netshoesAdvertiserId: '43984' }): any {
  return {
    groups: [{ id: 'g', groupJid: '120363000@g.us', name: 'Grupo', permissionStatus: 'verified_admin', canPost: true, createdAt: new Date().toISOString() }],
    // Como no cofre real: appId = Client ID, affiliateTag = SID numérico (formato diferente do id do link).
    stores: [{ id: 's', storeName: 'netshoes', appId: 'client-id-xyz', affiliateTag: '4764673', isActive: true, sessionData, createdAt: new Date().toISOString() }],
    credentials: [], jobs: [], history: [], scheduledMessages: [],
  };
}

function job(affiliateUrl: string, originalUrl?: string): PublicationJob {
  return {
    id: 'job-ns', userId: USER, originType: 'copiador', targetJid: '120363000@g.us',
    messageText: `👟 Tênis Adidas Barreda\n🔥 *Por R$ 199,90*\n${affiliateUrl}`,
    mediaUrl: 'https://static.netshoes.com.br/foto.jpg', mediaType: 'image',
    affiliateUrl, originalUrl, status: 'agendado', scheduledFor: new Date().toISOString(),
    attempts: 0, maxAttempts: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDemo: false,
  } as PublicationJob;
}

test('link da Rakuten gerado com as credenciais da conta passa (id criptografado ≠ SID numérico)', () => {
  const own = `https://click.linksynergy.com/deeplink?id=8*LerrTfM*o&mid=43984&murl=${murl}`;
  const result = validateJobForDispatch(job(own), db());
  assert.equal(result.valid, true, result.error);
});

test('link igual ao de quem postou a oferta original é barrado', () => {
  const third = `https://click.linksynergy.com/deeplink?id=TERCEIRO123&mid=43984&murl=${murl}`;
  const result = validateJobForDispatch(job(third, third), db());
  assert.equal(result.valid, false);
  assert.match(result.error || '', /terceiro/i);
});

test('quando o código criptografado da conta é conhecido, outro código é barrado', () => {
  const other = `https://click.linksynergy.com/deeplink?id=OUTRO&mid=43984&murl=${murl}`;
  const result = validateJobForDispatch(job(other), db({ netshoesAdvertiserId: '43984', rakutenEncryptedId: '8*LerrTfM*o' }));
  assert.equal(result.valid, false);
});

test('anunciante diferente da Netshoes é barrado', () => {
  const wrongMid = `https://click.linksynergy.com/deeplink?id=8*LerrTfM*o&mid=11111&murl=${murl}`;
  assert.equal(validateJobForDispatch(job(wrongMid), db()).valid, false);
});

test('o rastreio Rakuten de terceiros sai do endereço do produto', () => {
  const incoming = 'https://click.linksynergy.com/deeplink?id=TERCEIRO&mid=43984&murl='
    + encodeURIComponent('https://www.netshoes.com.br/p/tenis-x?af_channel=Affiliates&af_sub_siteID=abc&clickid=abc&campaign=afil_rakuten&ranMID=43984&ranEAID=abc&ranSiteID=abc&cor=branco');
  const clean = sanitizeStoreUrl(incoming, 'netshoes');
  assert.equal(clean, 'https://www.netshoes.com.br/p/tenis-x?cor=branco');
});
