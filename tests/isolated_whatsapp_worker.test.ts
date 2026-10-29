import test from 'node:test';
import assert from 'node:assert';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { NextRequest } from 'next/server';
import { GET as connectGET, POST as connectPOST } from '@/app/api/whatsapp/connect/route';
import { GET as groupsGET } from '@/app/api/whatsapp/groups/route';
import { GET as workerStatusGET } from '@/app/api/worker/status/route';
import { POST as workerTriggerPOST } from '@/app/api/worker/trigger/route';
import { POST as workerPollPOST } from '@/app/api/worker/poll/route';
import { POST as testDispatchPOST } from '@/app/api/copier/test-dispatch/route';
import {
  readDatabase,
  writeDatabase,
  getInitialDatabase,
  normalizeWhatsAppPhone,
  compareWhatsAppIds,
} from '@/lib/server/storage';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/server/auth';

// -----------------------------------------------------------------------------
// ISOLAMENTO TOTAL: Banco temporário em arquivo efêmero em os.tmpdir()
// O arquivo real .data/radar_db.json NUNCA é lido nem modificado nestes testes
// -----------------------------------------------------------------------------
const tempDbPath = path.join(
  os.tmpdir(),
  `radar_isolated_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
);
process.env.RADAR_DB_PATH = tempDbPath;

const originalFetch = global.fetch;
const originalCronSecret = process.env.CRON_SECRET;

test.beforeEach(() => {
  // Inicializa o banco temporário limpo para cada teste
  const initial = getInitialDatabase();
  initial.whatsapp.instanceName = 'radar_ofertas';
  initial.whatsapp.baseUrl = 'https://radar-whatsapp-gateway.onrender.com';
  initial.whatsapp.apiKey = 'test_key';
  initial.whatsapp.status = 'connected';
  initial.whatsapp.lastPingAt = '2026-10-27T12:00:00.000Z';
  const mlStore = initial.stores.find((s) => s.storeName === 'mercadolivre');
  if (mlStore) {
    mlStore.affiliateTag = 'radarofertas';
    mlStore.appId = 'ferramenta_radar';
    mlStore.isActive = true;
    mlStore.isValidated = true;
  }
  fs.writeFileSync(tempDbPath, JSON.stringify(initial, null, 2), 'utf-8');
});

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalCronSecret !== undefined) {
    process.env.CRON_SECRET = originalCronSecret;
  } else {
    delete process.env.CRON_SECRET;
  }
});

test.after(() => {
  try {
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  } catch {}
  delete process.env.RADAR_DB_PATH;
});

// =============================================================================
// PARTE 1: PROTEÇÃO DE AUTENTICAÇÃO DO WORKER (/api/worker/trigger e status)
// =============================================================================

test('1.1. /api/worker/trigger recusa chamadas sem sessão com HTTP 401', async () => {
  process.env.CRON_SECRET = 'super_secret_cron';

  const req = new NextRequest('http://localhost:3000/api/worker/trigger', {
    method: 'POST',
  });

  const res = await workerTriggerPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 401, 'Deve recusar sem sessão');
  assert.strictEqual(data.ok, false);
  assert.match(data.error, /administrador/i);
});

test('1.2. /api/worker/trigger recusa chamadas de usuário comum (role user) com HTTP 401', async () => {
  process.env.CRON_SECRET = 'super_secret_cron';

  const userToken = signSession({
    userId: 'user_comum_123',
    email: 'user@comum.com',
    role: 'user',
  });

  const req = new NextRequest('http://localhost:3000/api/worker/trigger', {
    method: 'POST',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${userToken}`,
    },
  });

  const res = await workerTriggerPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 401, 'Usuário comum não pode acionar o worker');
  assert.strictEqual(data.ok, false);
  assert.match(data.error, /administrador/i);
});

test('1.3. /api/worker/trigger recusa chamada de admin com HTTP 503 se CRON_SECRET estiver ausente no servidor', async () => {
  delete process.env.CRON_SECRET;

  const adminToken = signSession({
    userId: 'admin_master_123',
    email: 'admin@radarofertas.com',
    role: 'admin',
  });

  const req = new NextRequest('http://localhost:3000/api/worker/trigger', {
    method: 'POST',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
    },
  });

  const res = await workerTriggerPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 503);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.configured, false);
  assert.match(data.error, /CRON_SECRET ausente/i);
});

test('1.4. /api/worker/trigger com admin autenticado executa ciclo SIMULADO com sucesso sem envios', async () => {
  process.env.CRON_SECRET = 'segredo_servidor_seguro_123';

  const adminToken = signSession({
    userId: 'admin_master_123',
    email: 'admin@radarofertas.com',
    role: 'admin',
  });

  // O banco temporário não possui jobs agendados, garantindo que nenhum envio ocorra
  const db = readDatabase();
  db.jobs = [];
  writeDatabase(db);

  // Monitora e bloqueia qualquer chamada externa de envio
  let dispatchAttempted = false;
  global.fetch = async (url: string | URL | Request) => {
    const urlStr = String(url);
    if (urlStr.includes('/message/send')) {
      dispatchAttempted = true;
      throw new Error('Bloqueio de segurança: Envio real impedido durante teste');
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const req = new NextRequest('http://localhost:3000/api/worker/trigger', {
    method: 'POST',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
    },
  });

  const res = await workerTriggerPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.ok(data.report, 'Deve retornar o relatório do ciclo');
  assert.strictEqual(dispatchAttempted, false, 'Nenhum envio real deve ser executado');

  // Garante que o segredo CRON_SECRET NUNCA vaze na resposta
  const responseText = JSON.stringify(data);
  assert.strictEqual(responseText.includes('segredo_servidor_seguro_123'), false);
});

test('1.5. /api/worker/status indica availability apenas para administradores com segredo configurado', async () => {
  delete process.env.CRON_SECRET;

  // Sem sessão
  const unauthReq = new NextRequest('http://localhost:3000/api/worker/status');
  const unauthRes = await workerStatusGET(unauthReq);
  const unauthData = await unauthRes.json();
  assert.strictEqual(unauthData.available, false);
  assert.strictEqual(unauthData.isAdmin, false);
  assert.match(unauthData.reason, /autenticação de administrador/i);

  // Com sessão de admin, mas sem secret
  const adminToken = signSession({ userId: 'adm', email: 'adm@radarofertas.com', role: 'admin' });
  const adminReqNoSecret = new NextRequest('http://localhost:3000/api/worker/status', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
  });
  const adminResNoSecret = await workerStatusGET(adminReqNoSecret);
  const adminDataNoSecret = await adminResNoSecret.json();
  assert.strictEqual(adminDataNoSecret.available, false);
  assert.strictEqual(adminDataNoSecret.isAdmin, true);
  assert.match(adminDataNoSecret.reason, /CRON_SECRET não está configurado/i);

  // Com sessão de admin E com secret
  process.env.CRON_SECRET = 'secret_present';
  const adminReqWithSecret = new NextRequest('http://localhost:3000/api/worker/status', {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
  });
  const adminResWithSecret = await workerStatusGET(adminReqWithSecret);
  const adminDataWithSecret = await adminResWithSecret.json();
  assert.strictEqual(adminDataWithSecret.available, true);
  assert.strictEqual(adminDataWithSecret.isAdmin, true);
  assert.strictEqual(adminDataWithSecret.configured, true);
});

test('1.6. /api/worker/poll recusa chamadas sem autenticação de token', async () => {
  process.env.CRON_SECRET = 'secret_valido';
  const req = new NextRequest('http://localhost:3000/api/worker/poll', { method: 'POST' });
  const res = await workerPollPOST(req);
  assert.strictEqual(res.status, 401);
});

// =============================================================================
// PARTE 2: RESILIÊNCIA E PRESERVAÇÃO DE ESTADO DA CONEXÃO WHATSAPP
// =============================================================================

test('2.1. Timeout no gateway preserva status connected e lastPingAt sem gravar disconnected', async () => {
  const db = readDatabase();
  db.whatsapp.status = 'connected';
  const initialPing = '2026-10-27T14:00:00.000Z';
  db.whatsapp.lastPingAt = initialPing;
  writeDatabase(db);

  // Simula timeout da Evolution API (AbortError)
  global.fetch = async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };

  const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?check=true');
  const res = await connectGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 504);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.error, 'Não foi possível verificar agora');
  assert.strictEqual(data.verificationStatus, 'timeout');

  const dbAfter = readDatabase();
  assert.strictEqual(dbAfter.whatsapp.status, 'connected');
  assert.strictEqual(dbAfter.whatsapp.lastPingAt, initialPing);
  assert.strictEqual(dbAfter.whatsapp.lastVerificationStatus, 'timeout');
});

test('2.2. Gateway indisponível (HTTP 502/503) representa como "não foi possível verificar agora"', async () => {
  const db = readDatabase();
  db.whatsapp.status = 'connected';
  const initialPing = '2026-10-27T14:30:00.000Z';
  db.whatsapp.lastPingAt = initialPing;
  writeDatabase(db);

  global.fetch = async () => {
    return new Response('Service Unavailable (Cold start)', { status: 503 });
  };

  const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?check=true');
  const res = await connectGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 503);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.error, 'Não foi possível verificar agora');
  assert.strictEqual(data.verificationStatus, 'unreachable');

  const dbAfter = readDatabase();
  assert.strictEqual(dbAfter.whatsapp.status, 'connected');
  assert.strictEqual(dbAfter.whatsapp.lastPingAt, initialPing);
  assert.strictEqual(dbAfter.whatsapp.lastVerificationStatus, 'unreachable');
});

test('2.3. Falha preliminar no pareamento não avança automaticamente para /instance/connect', async () => {
  let connectEndpointCalled = false;

  global.fetch = async (url: string | URL | Request) => {
    const urlStr = String(url);
    if (urlStr.includes('/instance/connectionState/')) {
      return new Response('Gateway timeout', { status: 504 });
    }
    if (urlStr.includes('/instance/connect/')) {
      connectEndpointCalled = true;
      return new Response(JSON.stringify({ code: 'fake_qr' }), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  const req = new NextRequest('http://localhost:3000/api/whatsapp/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start_pairing' }),
  });

  const res = await connectPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 504);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(
    connectEndpointCalled,
    false,
    'Não deve invocar /instance/connect se a checagem preliminar falhar'
  );
});

test('2.4. Só marca disconnected quando o gateway responder validamente que a instância está fechada', async () => {
  const db = readDatabase();
  db.whatsapp.status = 'connected';
  writeDatabase(db);

  global.fetch = async () => {
    return new Response(
      JSON.stringify({
        state: 'close',
        instance: { state: 'close' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?check=true');
  const res = await connectGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.whatsapp.status, 'disconnected');

  const dbAfter = readDatabase();
  assert.strictEqual(dbAfter.whatsapp.status, 'disconnected');
  assert.strictEqual(dbAfter.whatsapp.lastVerificationStatus, 'verified');
});

test('2.5. Recuperação: resposta válida state "open" marca connected e atualiza lastPingAt', async () => {
  const db = readDatabase();
  db.whatsapp.status = 'connecting';
  writeDatabase(db);

  global.fetch = async () => {
    return new Response(
      JSON.stringify({
        state: 'open',
        instance: {
          state: 'open',
          profileName: 'Radar de Ofertas Bot',
          owner: '5511988887777@s.whatsapp.net',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?check=true');
  const res = await connectGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.whatsapp.status, 'connected');

  const dbAfter = readDatabase();
  assert.strictEqual(dbAfter.whatsapp.status, 'connected');
  assert.strictEqual(dbAfter.whatsapp.lastVerificationStatus, 'verified');
  assert.ok(dbAfter.whatsapp.lastPingAt, 'lastPingAt deve estar preenchido');
});

test('2.6. /api/whatsapp/groups identifica se lista é ao vivo ou cache quando gateway falha', async () => {
  global.fetch = async () => {
    return new Response('Gateway timeout', { status: 504 });
  };

  const req = new NextRequest('http://localhost:3000/api/whatsapp/groups?refresh=true');
  const res = await groupsGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.isLive, false);
  assert.strictEqual(data.cached, true);
  assert.ok(Array.isArray(data.groups));
  assert.ok(data.warning);
});

// =============================================================================
// PARTE 3: IDENTIFICAÇÃO DE IDENTIDADE, PERMISSÕES E TEST-DISPATCH
// =============================================================================

test('3.1. normalizeWhatsAppPhone e compareWhatsAppIds tratam 9º dígito e rejeitam comparação parcial', () => {
  // Equivalência do 9º dígito no Brasil: 55 + DDD (2) + 9 dígitos vs 8 dígitos
  const withNine = '5519993812187@s.whatsapp.net';
  const withoutNine = '551993812187@s.whatsapp.net';
  const lidId = '123456789@lid';

  // Deve casar o ownerJid com o telefone do participante
  assert.strictEqual(compareWhatsAppIds(withNine, lidId, withoutNine), true);
  assert.strictEqual(compareWhatsAppIds(withoutNine, lidId, withNine), true);
  assert.strictEqual(compareWhatsAppIds(withNine, withNine, undefined), true);

  // NUNCA deve casar números diferentes mesmo que um contenha o outro (evita falso positivo por includes)
  const differentPhone = '551999381218@s.whatsapp.net';
  const substringPhone = '99381218';
  assert.strictEqual(compareWhatsAppIds(withNine, lidId, differentPhone), false);
  assert.strictEqual(compareWhatsAppIds(withNine, lidId, substringPhone), false);
});

test('3.2. Sincronização ao vivo classifica conta como verified_admin e preserva seleções do usuário', async () => {
  const db = readDatabase();
  db.whatsapp.ownerJid = '5519993812187@s.whatsapp.net';
  db.groups = [
    {
      id: 'g-1',
      userId: 'u1',
      groupJid: '120363412589119281@g.us',
      name: 'Radar de Ofertas #1',
      participantCount: 10,
      isAdmin: false,
      canPost: false,
      permissionStatus: 'unverified',
      isOrigin: false,
      isDestination: true,
      isTestGroup: true,
      lastSyncedAt: new Date().toISOString(),
    },
  ];
  writeDatabase(db);

  global.fetch = async (url: RequestInfo | URL) => {
    const urlStr = String(url);
    if (urlStr.includes('/instance/fetchInstances')) {
      return new Response(JSON.stringify([{
        name: 'radar_ofertas',
        ownerJid: '5519993812187@s.whatsapp.net',
        profileName: 'Conta de teste',
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('/group/fetchAllGroups/')) {
      return new Response(
        JSON.stringify([
          {
            id: '120363412589119281@g.us',
            subject: 'Radar de Ofertas #1',
            announce: false,
            participants: [
              { id: '11111@lid', phoneNumber: '5511999990000@s.whatsapp.net', admin: null },
              { id: '22222@lid', phoneNumber: '5519993812187@s.whatsapp.net', admin: 'superadmin' },
            ],
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const req = new NextRequest('http://localhost:3000/api/whatsapp/groups?refresh=true');
  const res = await groupsGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);

  const radar1 = data.groups.find((g: { groupJid: string }) => g.groupJid === '120363412589119281@g.us');
  assert.ok(radar1);
  assert.strictEqual(radar1.isAdmin, true);
  assert.strictEqual(radar1.canPost, true);
  assert.strictEqual(radar1.permissionStatus, 'verified_admin');
  assert.strictEqual(radar1.roleDescription, 'Administrador Criador');
  // Escolhas manuais do usuário devem ser estritamente preservadas
  assert.strictEqual(radar1.isDestination, true, 'isDestination deve ser preservado');
  assert.strictEqual(radar1.isOrigin, false, 'isOrigin deve ser preservado');
  assert.strictEqual(radar1.isTestGroup, true, 'isTestGroup deve ser preservado');
});

test('3.3. /api/copier/test-dispatch exige autenticação de administrador (401)', async () => {
  const req = new NextRequest('http://localhost:3000/api/copier/test-dispatch', {
    method: 'POST',
    body: JSON.stringify({ previewOnly: true }),
  });
  const res = await testDispatchPOST(req);
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.strictEqual(data.ok, false);
});

test('3.4. /api/copier/test-dispatch em modo prévia gera texto e arte sem agendar trabalho no banco', async () => {
  const db = readDatabase();
  db.groups = [
    {
      id: 'g-test',
      userId: 'u1',
      groupJid: '120363412589119281@g.us',
      name: 'Radar de Ofertas #1',
      participantCount: 5,
      isAdmin: true,
      canPost: true,
      permissionStatus: 'verified_admin',
      isOrigin: false,
      isDestination: true,
      isTestGroup: true,
      lastSyncedAt: new Date().toISOString(),
    },
  ];
  db.jobs = [];
  writeDatabase(db);

  const adminToken = signSession({ userId: 'u1', email: 'admin@radarofertas.com', role: 'admin' });
  const req = new NextRequest('http://localhost:3000/api/copier/test-dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
    },
    body: JSON.stringify({
      groupJid: '120363412589119281@g.us',
      title: 'Smartwatch Pro de Homologação',
      url: 'https://www.mercadolivre.com.br/p/MLB20000000',
      imageUrl: 'https://http2.mlstatic.com/smartwatch-pro.jpg',
      currentPrice: 199.9,
      originalPrice: 299.9,
      previewOnly: true,
    }),
  });

  const res = await testDispatchPOST(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.previewOnly, true);
  assert.ok(data.previewMessage);
  assert.ok(data.artGenerated?.artUrl);
  assert.strictEqual(data.targetGroup.permissionStatus, 'verified_admin');
  assert.strictEqual(data.linkState, 'gerado');
  assert.strictEqual(data.canDispatch, false);

  // Nenhum job deve ter sido persistido no banco
  const dbAfter = readDatabase();
  assert.strictEqual(dbAfter.jobs.length, 0, 'Modo prévia NUNCA deve gravar jobs no banco');
});

test('3.5. /api/copier/test-dispatch exige confirmação explícita e nunca deixa mensagem agendada em falha', async () => {
  const db = readDatabase();
  db.groups = [
    {
      id: 'g-test',
      userId: 'u1',
      groupJid: '120363412589119281@g.us',
      name: 'Radar de Ofertas #1',
      participantCount: 5,
      isAdmin: true,
      canPost: true,
      permissionStatus: 'verified_admin',
      isOrigin: false,
      isDestination: true,
      isTestGroup: true,
      lastSyncedAt: new Date().toISOString(),
    },
  ];
  // Configura Shopee com App ID e Secret válidos para permitir link curto oficial comprovado
  const shopeeIdx = db.stores.findIndex((s) => s.storeName === 'shopee');
  const shopeeCreds = {
    id: 'store_shopee',
    userId: 'u1',
    storeName: 'shopee' as const,
    appId: '10023456',
    appSecret: 'sec_real_affiliate_signature_key_valid',
    affiliateTag: 'radar_real_sub',
    isActive: true,
    updatedAt: new Date().toISOString(),
  };
  if (shopeeIdx >= 0) db.stores[shopeeIdx] = shopeeCreds;
  else db.stores.push(shopeeCreds);

  writeDatabase(db);

  const adminToken = signSession({ userId: 'u1', email: 'admin@radarofertas.com', role: 'admin' });

  // 1. Tentar envio real sem confirmed: true -> 400
  const reqNoConfirm = new NextRequest('http://localhost:3000/api/copier/test-dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
    },
    body: JSON.stringify({
      groupJid: '120363412589119281@g.us',
      title: 'Smartwatch Pro',
      url: 'https://shopee.com.br/product/123/456',
      currentPrice: 199.9,
      confirmed: false,
    }),
  });
  const resNoConfirm = await testDispatchPOST(reqNoConfirm);
  assert.strictEqual(resNoConfirm.status, 400);

  // 2. Envio com confirmação mas simulação de Shopee GraphQL gerando shortLink oficial + falha no gateway WhatsApp (502)
  global.fetch = async (url: RequestInfo | URL) => {
    const urlStr = String(url);
    if (urlStr.includes('open-api.affiliate.shopee.com.br')) {
      return new Response(
        JSON.stringify({
          data: {
            generateShortLink: {
              shortLink: 'https://s.shopee.com.br/radar_teste_oficial',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Gateway Evolution retorna 502
    return new Response('Gateway WhatsApp indisponível', { status: 502 });
  };

  const reqConfirmed = new NextRequest('http://localhost:3000/api/copier/test-dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
    },
    body: JSON.stringify({
      groupJid: '120363412589119281@g.us',
      title: 'Smartwatch Pro',
      url: 'https://shopee.com.br/product/123/456',
      currentPrice: 199.9,
      confirmed: true,
    }),
  });

  const resConfirmed = await testDispatchPOST(reqConfirmed);
  assert.strictEqual(resConfirmed.status, 200);
  const dataConfirmed = await resConfirmed.json();
  assert.strictEqual(dataConfirmed.ok, true);
  assert.strictEqual(dataConfirmed.dispatched, false);
  assert.strictEqual(dataConfirmed.job.status, 'falha', 'Job com entrega falhada deve ser status falha');

  const dbAfter = readDatabase();
  const savedJob = dbAfter.jobs.find((j) => j.id === dataConfirmed.job.id);
  assert.ok(savedJob);
  assert.strictEqual(savedJob.status, 'falha', 'Job NUNCA deve permanecer agendado em caso de erro');
});
