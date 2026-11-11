import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';
import { signSessionTokenEdge, inspectSessionEdge, SESSION_COOKIE_NAME } from '../src/lib/edge-session';

test('Segurança de Redirecionamento & Middleware Anti-Loop', async (t) => {
  const secret = process.env.SESSION_SECRET || 'test-secret-at-least-32-chars-long-12345678';
  process.env.SESSION_SECRET = secret;

  await t.test('1. Acesso a / sem autenticação redireciona para /login limpo (sem ?redirect=%2F)', async () => {
    const req = new NextRequest('http://localhost:3000/');
    const res = await middleware(req);

    assert.equal(res.status, 307);
    const location = res.headers.get('location');
    assert.ok(location);
    const url = new URL(location);
    assert.equal(url.pathname, '/login');
    assert.equal(url.searchParams.get('redirect'), null, 'Não deve poluir a URL com ?redirect=/');
  });

  await t.test('2. Acesso a rota interna (/copiador) sem autenticação preserva o destino limpo', async () => {
    const req = new NextRequest('http://localhost:3000/copiador');
    const res = await middleware(req);

    assert.equal(res.status, 307);
    const location = res.headers.get('location');
    assert.ok(location);
    const url = new URL(location);
    assert.equal(url.pathname, '/login');
    assert.equal(url.searchParams.get('redirect'), '/copiador');
  });

  await t.test('3. Tentativa de loop no redirect (/login?redirect=/login ou %2F) é neutralizada', async () => {
    // Simula um usuário que já está autenticado tentando abrir /login?redirect=/login
    const validToken = await signSessionTokenEdge(
      { userId: 'usr-valid-1', email: 'teste@radarofertas.com', role: 'admin' },
      secret,
      3600
    );

    const reqLoop = new NextRequest('http://localhost:3000/login?redirect=%2Flogin', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${validToken}` },
    });
    const res = await middleware(reqLoop);

    assert.equal(res.status, 307);
    const location = res.headers.get('location');
    assert.ok(location);
    const url = new URL(location);
    assert.equal(url.pathname, '/', 'Deve neutralizar redirect para /login e mandar para /');
  });

  await t.test('4. Usuário não autenticado em /login recebe passagem livre (HTTP 200 / Next)', async () => {
    const req = new NextRequest('http://localhost:3000/login');
    const res = await middleware(req);
    // NextResponse.next() tem status 200 e header x-middleware-next
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-middleware-next'), '1');
  });

  await t.test('5. Usuário autenticado acessando /login é encaminhado para o painel', async () => {
    const validToken = await signSessionTokenEdge(
      { userId: 'usr-valid-2', email: 'adm@radar.com', role: 'admin' },
      secret,
      3600
    );

    const req = new NextRequest('http://localhost:3000/login', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${validToken}` },
    });
    const res = await middleware(req);

    assert.equal(res.status, 307);
    const location = res.headers.get('location');
    assert.ok(location);
    const url = new URL(location);
    assert.equal(url.pathname, '/');
  });

  await t.test('6. Rotas públicas (/cadastro, /termos, /ajuda, /r/123, /@slug) permitem passagem livre', async () => {
    const publicPaths = ['/cadastro', '/termos', '/ajuda', '/r/xyz123', '/@minhaloja'];
    for (const path of publicPaths) {
      const req = new NextRequest(`http://localhost:3000${path}`);
      const res = await middleware(req);
      assert.equal(res.status, 200, `Rota pública ${path} deve responder 200`);
      assert.equal(res.headers.get('x-middleware-next'), '1');
    }
  });

  await t.test('7. Sessão expirada ou com assinatura inválida é recusada com código expired/inválido', async () => {
    const expiredToken = await signSessionTokenEdge(
      { userId: 'usr-expired', email: 'exp@radar.com', role: 'admin' },
      secret,
      -10 // já expirado
    );

    const inspection = await inspectSessionEdge(expiredToken, secret);
    assert.equal(inspection.valid, false);
    assert.equal(inspection.expired, true);

    const fakeToken = 'header.payload.invalid-signature';
    const fakeInspection = await inspectSessionEdge(fakeToken, secret);
    assert.equal(fakeInspection.valid, false);
    assert.equal(Boolean(fakeInspection.expired), false);
  });
});
