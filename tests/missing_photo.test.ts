import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNetshoesImage, createNoPhotoArt } from '../src/lib/server/missing-photo';

const XML = `<result><TotalMatches>57</TotalMatches>
<item><productname>Tênis Adidas Ultimashow 2.0 Audi Revolut F1 Team - Preto</productname><sku>FBA-85F4-F01-37</sku><imageurl>https://static.netshoes.com.br/produtos/audi/01/FBA-85F4-F01/FBA-85F4-F01_zoom1.jpg</imageurl></item>
<item><productname>Tênis Adidas Ultimashow 2.0 Feminino - Feminino</productname><sku>FBA-5034-158-35</sku><imageurl>https://static.netshoes.com.br/produtos/fem/58/FBA-5034-158/FBA-5034-158_zoom1.jpg</imageurl></item>
</result>`;

test('Netshoes: escolhe a foto do item cujo código aparece no link da oferta', () => {
  assert.equal(
    pickNetshoesImage(XML, 'https://www.netshoes.com.br/p/tenis-adidas-ultimashow-20-feminino-FBA-5034-158', 'Tênis Adidas Ultimashow 2.0'),
    'https://static.netshoes.com.br/produtos/fem/58/FBA-5034-158/FBA-5034-158_zoom1.jpg'
  );
});

test('Netshoes: sem código no link, aceita só nome que bate com o título', () => {
  assert.equal(
    pickNetshoesImage(XML, 'https://www.netshoes.com.br/', 'Tênis Adidas Ultimashow 2.0 Audi Revolut F1 Team'),
    'https://static.netshoes.com.br/produtos/audi/01/FBA-85F4-F01/FBA-85F4-F01_zoom1.jpg'
  );
  assert.equal(pickNetshoesImage(XML, 'https://www.netshoes.com.br/', 'Camiseta Vans Determined'), null);
  assert.equal(pickNetshoesImage('<result><Errors/></result>', 'x', 'y'), null);
});

test('arte de reserva usa o logo da loja, os dados da oferta e devolve a URL salva', async () => {
  const calls: any[] = [];
  const url = await createNoPhotoArt(
    { userId: 'u1', store: 'amazon', title: 'Creatina Growth 500g', priceCurrent: 53, priceOriginal: null, coupon: undefined, messageId: 'MSG 9' },
    {
      render: async (userId, req) => { calls.push({ userId, req }); return Buffer.from('png'); },
      upload: async (buf, path, type) => { calls.push({ path, type }); return `https://cdn/${path}`; },
    }
  );
  assert.equal(calls[0].req.imagePathOrUrl, '/brands/amazon-original.png');
  assert.equal(calls[0].req.title, 'Creatina Growth 500g');
  assert.equal(calls[0].req.priceCurrent, 53);
  assert.equal(calls[1].type, 'image/png');
  assert.equal(url, 'https://cdn/copier-art/MSG9.png');
});

test('sem preço ou loja sem logo não gera arte', async () => {
  const deps = { render: async () => Buffer.from('x'), upload: async () => 'https://cdn/x' };
  assert.equal(await createNoPhotoArt({ userId: 'u', store: 'amazon', title: 'X', priceCurrent: 0, messageId: 'a' }, deps), undefined);
  assert.equal(await createNoPhotoArt({ userId: 'u', store: 'lojax' as any, title: 'X', priceCurrent: 10, messageId: 'a' }, deps), undefined);
});

test('Netshoes: nome ambíguo (vários modelos) não escolhe foto', () => {
  assert.equal(pickNetshoesImage(XML, 'https://www.netshoes.com.br/', 'Tênis Adidas Ultimashow 2.0'), null);
});

test('arte do WhatsApp diz "link na mensagem", não "link na bio"', async () => {
  let req: any;
  await createNoPhotoArt({ userId: 'u', store: 'netshoes', title: 'Tênis X', priceCurrent: 99, messageId: 'm' }, {
    render: async (_u, r) => { req = r; return Buffer.from('x'); }, upload: async () => 'https://cdn/x',
  });
  assert.equal(req.footerCta, 'link na mensagem');
});
