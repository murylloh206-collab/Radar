import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENTOS } from '../src/lib/legal/documentos';
import { clientIp, newProtocol, TITULAR_KINDS } from '../src/lib/server/compliance';

test('documentos legais: slugs únicos e nenhuma seção vazia', () => {
  const slugs = DOCUMENTOS.map(d => d.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of ['termos', 'privacidade', 'cookies', 'seguranca', 'retencao', 'uso-aceitavel', 'aditivo-dados']) {
    assert.ok(slugs.includes(slug), `falta ${slug}`);
  }
  for (const doc of DOCUMENTOS) {
    assert.ok(doc.base.length > 10, `${doc.slug} sem base legal`);
    for (const secao of doc.secoes) assert.ok(secao.blocos.length > 0, `${doc.slug}/${secao.id} vazia`);
  }
});

test('termos trazem arrependimento de 7 dias, SLA, força maior e foro', () => {
  const termos = JSON.stringify(DOCUMENTOS.find(d => d.slug === 'termos'));
  for (const trecho of ['7 (sete) dias', 'art. 49', '99%', 'art. 393', 'art. 101']) assert.ok(termos.includes(trecho), trecho);
});

test('protocolo de titular tem formato estável e é único', () => {
  const a = newProtocol(new Date('2026-11-17T10:00:00Z'));
  assert.match(a, /^LGPD-20261117-[0-9A-F]{6}$/);
  assert.notEqual(newProtocol(), newProtocol());
  assert.ok(TITULAR_KINDS.includes('exclusao'));
});

test('IP do cliente vem do primeiro x-forwarded-for', () => {
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1' })), '200.1.2.3');
  assert.equal(clientIp(new Headers({ 'x-real-ip': '200.9.9.9' })), '200.9.9.9');
  assert.equal(clientIp(new Headers()), null);
});
