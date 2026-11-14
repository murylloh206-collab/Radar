import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractRakutenCredentials,
  extractRakutenSid,
  extractAmazonTag,
  extractShopeeCredentials,
  detectStorePage,
} from '../chrome-extension/extractors.js';

const ID = 'K8p3Qz9vWm2Lx7RdK8p3Qz9vWm2Lx7Rd';
const SECRET = 'H4n8Tq2Zx6BvH4n8Tq2Zx6BvH4n8Tq2Z';

test('Rakuten: lê Client ID e Secret pela coluna, mesmo em outra ordem', () => {
  assert.deepEqual(
    extractRakutenCredentials({ headers: ['Name', 'Client ID', 'Client Secret', 'Actions'], rows: [['Radar de Ofertas', ID, SECRET, 'Generate Token']] }),
    { clientId: ID, clientSecret: SECRET }
  );
  assert.deepEqual(
    extractRakutenCredentials({ headers: ['Client Secret', 'Name', 'Client ID'], rows: [[SECRET, 'App', ID]] }),
    { clientId: ID, clientSecret: SECRET }
  );
});

test('Rakuten: sem a coluna do Secret devolve null', () => {
  assert.equal(extractRakutenCredentials({ headers: ['Name', 'Client ID'], rows: [['App', ID]] }), null);
});

test('Rakuten: lê o SID do botão da conta', () => {
  assert.equal(extractRakutenSid('Michel\nSID (ID do Site) 3846201\nSair'), '3846201');
});

test('Shopee: lê AppID e Senha da página Abrir API', () => {
  assert.deepEqual(
    extractShopeeCredentials('Meu API Válido AppID: 18398765432 Senha: ABCDEFGHIJKLMNOPQRSTUVWXYZ987654 Redefinir'),
    { appId: '18398765432', appSecret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ987654' }
  );
  assert.equal(extractShopeeCredentials('Meu API AppID: 18398765432 Senha: ******** Redefinir'), null);
});

test('Amazon: usa o campo store_id e, sem ele, o texto StoreID', () => {
  assert.equal(extractAmazonTag('radardeofe00a-20', ''), 'radardeofe00a-20');
  assert.equal(extractAmazonTag(null, 'Olá, Michel\nStoreID: radardeofe00a-20\nGanhos'), 'radardeofe00a-20');
});

test('página de login (sem dados) não inventa nada', () => {
  const login = 'Faça login ou crie uma conta\nInsira um número de celular ou um endereço de e-mail\nContinuar';
  assert.equal(extractAmazonTag(null, login), null);
  assert.equal(extractRakutenSid(login), null);
  assert.equal(extractShopeeCredentials(login), null);
  assert.equal(extractRakutenCredentials({ headers: [], rows: [] }), null);
});

test('reconhece as 5 páginas das lojas', () => {
  assert.equal(detectStorePage('https://developers.rakutenadvertising.com/default/dashboard/'), 'rakuten_dev');
  assert.equal(detectStorePage('https://publisher.rakutenadvertising.com/'), 'rakuten_publisher');
  assert.equal(detectStorePage('https://affiliate.shopee.com.br/open_api'), 'shopee');
  assert.equal(detectStorePage('https://associados.amazon.com.br/home?x=1'), 'amazon');
  assert.equal(detectStorePage('https://www.mercadolivre.com.br/afiliados'), 'mercadolivre');
  assert.equal(detectStorePage('https://www.google.com/'), null);
  assert.equal(detectStorePage('https://evil.com/associados.amazon.com.br/home'), null);
});
