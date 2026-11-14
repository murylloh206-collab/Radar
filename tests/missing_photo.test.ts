import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { pickNetshoesImage, findAmazonPhotoByAsin } from '../src/lib/server/missing-photo';

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

test('Netshoes: nome ambíguo (vários modelos) não escolhe foto', () => {
  assert.equal(pickNetshoesImage(XML, 'https://www.netshoes.com.br/', 'Tênis Adidas Ultimashow 2.0'), null);
});

test('Amazon: foto pelo código do produto (ASIN) quando é uma imagem de verdade', async () => {
  const jpg = await sharp({ create: { width: 500, height: 500, channels: 3, background: '#fff' } }).jpeg().toBuffer();
  const urls: string[] = [];
  const photo = await findAmazonPhotoByAsin('B0DTV3WN3V', async (u: string) => { urls.push(u); return new Response(jpg, { status: 200, headers: { 'content-type': 'image/jpeg' } }); });
  assert.equal(photo, 'https://m.media-amazon.com/images/P/B0DTV3WN3V.01.LZZZZZZZ.jpg');
  assert.equal(urls[0], photo);
});

test('Amazon: imagem vazia (GIF de 1 pixel), erro ou ASIN inválido → sem foto', async () => {
  const gif = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).gif().toBuffer();
  assert.equal(await findAmazonPhotoByAsin('B0HDFV9XDD', async () => new Response(gif, { status: 200, headers: { 'content-type': 'image/gif' } })), undefined);
  assert.equal(await findAmazonPhotoByAsin('B0HDFV9XDD', async () => new Response('x', { status: 404 })), undefined);
  assert.equal(await findAmazonPhotoByAsin('../etc', async () => new Response('x')), undefined);
});
