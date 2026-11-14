import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSourceImageUrl, messageHasImage } from '../src/lib/server/source-image';

const originalFetch = global.fetch;
test.afterEach(() => { global.fetch = originalFetch; });

const DATA = { key: { id: 'MSG1', remoteJid: '123@g.us' }, message: { imageMessage: { caption: 'Oferta', mimetype: 'image/jpeg' } } };

test('reconhece mensagem com foto (inclusive dentro de ephemeral/viewOnce)', () => {
  assert.equal(messageHasImage(DATA), true);
  assert.equal(messageHasImage({ message: { ephemeralMessage: { message: { imageMessage: {} } } } }), true);
  assert.equal(messageHasImage({ message: { conversation: 'só texto' } }), false);
});

test('baixa a foto da mensagem pela Evolution e devolve a URL pública salva', async () => {
  const calls: any[] = [];
  global.fetch = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ base64: Buffer.from('jpegbytes').toString('base64'), mimetype: 'image/jpeg' }), { status: 200 });
  }) as typeof fetch;
  const uploads: any[] = [];
  const url = await fetchSourceImageUrl({
    baseUrl: 'https://gw.example.com/', apiKey: 'k', instanceName: 'inst 1', messageData: DATA, messageId: 'MSG1',
    upload: async (buf, path, type) => { uploads.push({ len: buf.length, path, type }); return `https://cdn.example.com/${path}`; },
  });
  assert.equal(calls[0].url, 'https://gw.example.com/chat/getBase64FromMediaMessage/inst%201');
  assert.equal((calls[0].init.headers as any).apikey, 'k');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).message.key, DATA.key);
  assert.equal(uploads[0].type, 'image/jpeg');
  assert.match(uploads[0].path, /^copier-source\/MSG1\.jpg$/);
  assert.equal(url, 'https://cdn.example.com/copier-source/MSG1.jpg');
});

test('sem foto na mensagem ou com falha da Evolution, não inventa imagem', async () => {
  let called = false;
  global.fetch = (async () => { called = true; return new Response('erro', { status: 500 }); }) as typeof fetch;
  const up = async () => 'https://x';
  assert.equal(await fetchSourceImageUrl({ baseUrl: 'https://gw', apiKey: 'k', instanceName: 'i', messageData: { message: { conversation: 'oi' } }, messageId: 'M', upload: up }), undefined);
  assert.equal(called, false);
  assert.equal(await fetchSourceImageUrl({ baseUrl: 'https://gw', apiKey: 'k', instanceName: 'i', messageData: DATA, messageId: 'M', upload: up }), undefined);
});
