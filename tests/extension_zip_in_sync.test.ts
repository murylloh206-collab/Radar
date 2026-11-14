import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Lê um arquivo de dentro do zip (formato ZIP padrão, via diretório central).
function readFromZip(zipPath: string, name: string): Buffer | null {
  const buf = fs.readFileSync(zipPath);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.subarray(p + 46, p + 46 + nlen).toString('utf8').replace(/\\/g, '/');
    if (entry === name) {
      const lnlen = buf.readUInt16LE(local + 26);
      const lelen = buf.readUInt16LE(local + 28);
      const data = buf.subarray(local + 30 + lnlen + lelen, local + 30 + lnlen + lelen + csize);
      return method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p += 46 + nlen + elen + clen;
  }
  return null;
}

const ROOT = path.resolve(__dirname, '..');
const ZIP = path.join(ROOT, 'public', 'downloads', 'radar-conector.zip');

test('o zip baixado pelo painel tem exatamente os arquivos atuais da extensão', () => {
  for (const file of ['manifest.json', 'popup.js', 'popup.html', 'popup.css', 'extractors.js', 'background.js']) {
    const inZip = readFromZip(ZIP, file);
    assert.ok(inZip, `${file} ausente no zip`);
    const lf = (t: string) => t.split(String.fromCharCode(13)).join("");
    assert.equal(lf(inZip!.toString('utf8')), lf(fs.readFileSync(path.join(ROOT, 'chrome-extension', file), 'utf8')), `${file} desatualizado no zip`);
  }
});
