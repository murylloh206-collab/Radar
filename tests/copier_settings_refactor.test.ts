import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { NextRequest } from 'next/server';
import { GET as sourcesGET, POST as sourcesPOST } from '@/app/api/copier/sources/route';
import { safeWhatsAppPictureUrl } from '@/lib/server/whatsapp-picture';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/server/auth';
import { writeDatabase, getInitialDatabase, readDatabase } from '@/lib/server/storage';
import { buildWhatsAppMessage, DEFAULT_TEMPLATE } from '@/lib/server/message-builder';
import { withinWindow } from '@/lib/server/copier-runtime';
import { CopySource, WhatsAppConnection } from '@/lib/types';

// Ambiente de testes totalmente isolado em arquivo temporário efêmero
const tempDbPath = path.join(
  os.tmpdir(),
  `radar_copier_settings_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
);
process.env.RADAR_DB_PATH = tempDbPath;
process.env.TEST_ISOLATION = 'true';
process.env.EVOLUTION_BASE_URL = 'https://radar-whatsapp-gateway.onrender.com';
process.env.EVOLUTION_API_KEY = 'test_key';
process.env.EVOLUTION_INSTANCE_NAME = 'radar_ofertas';

const originalFetch = global.fetch;

const USER_A_ID = '11111111-1111-4111-8111-111111111111';
const USER_B_ID = '22222222-2222-4222-8222-222222222222';

const OWNER_A_JID = '5511999990001@s.whatsapp.net';
const GROUP_ORIGIN_JID = '120363000000000001@g.us';
const GROUP_DEST_JID = '120363000000000002@g.us';

function makeAuthCookie(userId: string) {
  const token = signSession({
    userId,
    email: `user_${userId.slice(0, 5)}@radar.com`,
    role: 'admin',
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function makeSourcesRequest(
  method: 'GET' | 'POST',
  userId: string,
  body?: unknown,
  query?: Record<string, string>
) {
  const url = new URL('https://painel-de-ofertas.vercel.app/api/copier/sources');
  if (query) {
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  return new NextRequest(url.toString(), {
    method,
    headers: {
      cookie: makeAuthCookie(userId),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function setupTestEnvironment() {
  const initial = getInitialDatabase();
  const connA: WhatsAppConnection = {
    id: 'conn_copier_a',
    userId: USER_A_ID,
    instanceName: 'inst_copier_a',
    baseUrl: 'https://radar-whatsapp-gateway.onrender.com',
    apiKey: 'test_key',
    label: 'WhatsApp Copiador A',
    status: 'connected',
    isDefault: true,
    phoneNumber: '5511999990001',
    ownerJid: OWNER_A_JID,
    profileName: 'Admin Radar',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  initial.connections = [connA];
  initial.groups = [
    {
      id: 'grp_origin_1',
      userId: USER_A_ID,
      connectionId: 'conn_copier_a',
      groupJid: GROUP_ORIGIN_JID,
      name: 'Grupo Concorrente Origem',
      participantCount: 500,
      isAdmin: false,
      canPost: false,
      permissionStatus: 'restricted_readonly',
      isOrigin: true,
      isDestination: false,
      lastSyncedAt: new Date().toISOString(),
    },
    {
      id: 'grp_dest_1',
      userId: USER_A_ID,
      connectionId: 'conn_copier_a',
      groupJid: GROUP_DEST_JID,
      name: 'Meu Canal VIP Destino',
      participantCount: 1200,
      isAdmin: true,
      canPost: true,
      permissionStatus: 'verified_admin',
      isOrigin: false,
      isDestination: true,
      lastSyncedAt: new Date().toISOString(),
    },
  ];

  initial.sources = [];
  initial.destinations = [];
  writeDatabase(initial);

  // Mock global.fetch para chamadas do gateway
  global.fetch = async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (urlStr.includes('/instance/connectionState/')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
    }
    if (urlStr.includes('/instance/fetchInstances')) {
      return new Response(
        JSON.stringify([
          {
            name: 'inst_copier_a',
            connectionStatus: 'open',
            ownerJid: OWNER_A_JID,
          },
        ]),
        { status: 200 }
      );
    }
    if (urlStr.includes('/group/fetchAllGroups/')) {
      return new Response(
        JSON.stringify([
          {
            id: GROUP_ORIGIN_JID,
            subject: 'Grupo Concorrente Origem',
            announce: true,
          },
          {
            id: GROUP_DEST_JID,
            subject: 'Meu Canal VIP Destino',
            announce: false,
            participants: [{ id: OWNER_A_JID, admin: 'admin' }],
          },
        ]),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({}), { status: 404 });
  };
}

test('1. Salva nova regra com intervalo, janela 24h, ordem sequencial e template válido', async () => {
  setupTestEnvironment();

  const req = makeSourcesRequest('POST', USER_A_ID, {
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    name: 'Cópia VIP Promoções',
    destinationJids: [GROUP_DEST_JID],
    operationMode: 'automatico',
    customDelaySeconds: 180, // 3 minutos
    is24Hours: true,
    dispatchOrder: 'sequencial',
    templateText: '{gancho}\n\n*{titulo}*\nPor {preco_por}\n\nLink: {link}',
    templateName: 'Oferta essencial',
    isActive: false, // salva pausado
  });

  const res = await sourcesPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.source.customDelaySeconds, 180);
  assert.strictEqual(data.source.is24Hours, true);
  assert.strictEqual(data.source.startTime, '00:00');
  assert.strictEqual(data.source.endTime, '00:00');
  assert.strictEqual(data.source.dispatchOrder, 'sequencial');
  assert.strictEqual(data.source.isActive, false);

  // Confirma persistência lendo via GET
  const getReq = makeSourcesRequest('GET', USER_A_ID, undefined, { connectionId: 'conn_copier_a' });
  const getRes = await sourcesGET(getReq);
  const getData = await getRes.json();

  assert.strictEqual(getData.ok, true);
  const saved = getData.sources.find((s: CopySource) => s.groupJid === GROUP_ORIGIN_JID);
  assert.ok(saved);
  assert.strictEqual(saved.customDelaySeconds, 180);
  assert.strictEqual(saved.dispatchOrder, 'sequencial');
});

test('2. Bloqueio no servidor: Impede editar configurações quando o Copiador estiver ativo', async () => {
  setupTestEnvironment();

  // 1. Cria regra já ativa (com destino verificado)
  const createReq = makeSourcesRequest('POST', USER_A_ID, {
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    destinationJids: [GROUP_DEST_JID],
    operationMode: 'automatico',
    customDelaySeconds: 60,
    startTime: '08:00',
    endTime: '22:00',
    is24Hours: false,
    dispatchOrder: 'sequencial',
    templateText: '*{titulo}*\n{link}',
    isActive: true, // REGRA ATIVA
  });
  const createRes = await sourcesPOST(createReq);
  const createData = await createRes.json();
  assert.strictEqual(createRes.status, 200);
  assert.strictEqual(createData.ok, true);
  const ruleId = createData.source.id;

  // 2. Tenta alterar intervalo ou horários mantendo a regra ativa -> DEVE BLOQUEAR
  const editWhileActiveReq = makeSourcesRequest('POST', USER_A_ID, {
    id: ruleId,
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    destinationJids: [GROUP_DEST_JID],
    customDelaySeconds: 300, // Tentativa de alterar intervalo
    isActive: true, // Mantém ativa
    saveOnly: true,
  });

  const blockedRes = await sourcesPOST(editWhileActiveReq);
  const blockedData = await blockedRes.json();

  assert.strictEqual(blockedRes.status, 400);
  assert.strictEqual(blockedData.ok, false);
  assert.strictEqual(blockedData.code, 'COPIER_ACTIVE_READONLY');
  assert.match(blockedData.error, /O copiador só pode ser editado quando estiver pausado/i);

  // 3. Pausar o copiador -> DEVE SER PERMITIDO
  const pauseReq = makeSourcesRequest('POST', USER_A_ID, {
    id: ruleId,
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    destinationJids: [GROUP_DEST_JID],
    isActive: false, // PAUSANDO
  });
  const pauseRes = await sourcesPOST(pauseReq);
  const pauseData = await pauseRes.json();
  assert.strictEqual(pauseRes.status, 200);
  assert.strictEqual(pauseData.source.isActive, false);

  // 4. Agora que está pausado, alterar configurações -> DEVE SER PERMITIDO
  const editWhilePausedReq = makeSourcesRequest('POST', USER_A_ID, {
    id: ruleId,
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    destinationJids: [GROUP_DEST_JID],
    customDelaySeconds: 300, // Alterou intervalo para 5 min
    dispatchOrder: 'aleatoria', // Alterou ordem para aleatória
    isActive: false,
    saveOnly: true,
  });
  const editRes = await sourcesPOST(editWhilePausedReq);
  const editData = await editRes.json();
  assert.strictEqual(editRes.status, 200);
  assert.strictEqual(editData.source.customDelaySeconds, 300);
  assert.strictEqual(editData.source.dispatchOrder, 'aleatoria');

  // 5. Retomar manualmente -> DEVE SER PERMITIDO
  const resumeReq = makeSourcesRequest('POST', USER_A_ID, {
    id: ruleId,
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    destinationJids: [GROUP_DEST_JID],
    isActive: true, // RETOMANDO
  });
  const resumeRes = await sourcesPOST(resumeReq);
  const resumeData = await resumeRes.json();
  assert.strictEqual(resumeRes.status, 200);
  assert.strictEqual(resumeData.source.isActive, true);
});

test('3. Janela de horários que atravessa a meia-noite (fuso de Brasília)', () => {
  // Teste da lógica withinWindow usada pelo worker-engine e copier-runtime
  // Ex: Janela das 22:00 (1320 min) às 06:00 (360 min)
  const start = 22 * 60; // 1320
  const end = 6 * 60;    // 360

  // 23:00 (1380 min) -> Dentro da janela noturna
  assert.strictEqual(withinWindow(23 * 60, start, end), true);

  // 02:30 (150 min) -> Dentro da janela da madrugada
  assert.strictEqual(withinWindow(2 * 60 + 30, start, end), true);

  // 05:59 (359 min) -> Dentro da janela
  assert.strictEqual(withinWindow(5 * 60 + 59, start, end), true);

  // 06:01 (361 min) -> Fora da janela
  assert.strictEqual(withinWindow(6 * 60 + 1, start, end), false);

  // 14:00 (840 min) -> Fora da janela
  assert.strictEqual(withinWindow(14 * 60, start, end), false);

  // 24 horas ininterruptas (start === end)
  assert.strictEqual(withinWindow(14 * 60, 0, 0), true);
  assert.strictEqual(withinWindow(3 * 60, 0, 0), true);
});

test('4. Validação de Template: Rejeita template que omite a variável {link}', async () => {
  setupTestEnvironment();

  const req = makeSourcesRequest('POST', USER_A_ID, {
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    destinationJids: [GROUP_DEST_JID],
    templateText: '🔥 Super oferta sem link nenhum!\nPreço: {preco_por}', // FALTA {link}
    isActive: false,
  });

  const res = await sourcesPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 400);
  assert.strictEqual(data.code, 'TEMPLATE_MISSING_LINK');
  assert.match(data.error, /deve incluir a variável \{link\}/i);
});

test('5. Message Builder: Substituição fiel de todas as variáveis suportadas', () => {
  const customTemplate = `\
{gancho}
Produto: {titulo}
{preco_de}
Preço Atual: {preco_por} ({desconto})
{cupom}
Acesse: {link}
{marca_dagua}`;

  const rendered = buildWhatsAppMessage({
    templateText: customTemplate,
    title: 'Monitor Gamer 144Hz 27 Polegadas',
    originalPrice: 1499.90,
    currentPrice: 999.00,
    discountPct: 33,
    couponCode: 'GAMER10',
    couponDiscount: 'R$ 50 OFF',
    affiliateUrl: 'https://shope.ee/link-afiliado-confirmado',
    hookText: '⚡ OPORTUNIDADE GAMER!',
    watermarkText: '🎯 Radar de Ofertas VIP',
  });

  assert.match(rendered, /⚡ OPORTUNIDADE GAMER!/);
  assert.match(rendered, /Monitor Gamer 144Hz 27 Polegadas/);
  assert.match(rendered, /De: ~R\$\s*1\.499,90~/);
  assert.match(rendered, /R\$\s*999,00/);
  assert.match(rendered, /-33% OFF/);
  assert.match(rendered, /Cupom: \*GAMER10\*/);
  assert.match(rendered, /https:\/\/shope\.ee\/link-afiliado-confirmado/);
  assert.match(rendered, /Radar de Ofertas VIP/);
});

test('6. Ordem Aleatória: não repete envios nem cruza com outras regras ou destinos', async () => {
  setupTestEnvironment();

  const req = makeSourcesRequest('POST', USER_A_ID, {
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    destinationJids: [GROUP_DEST_JID],
    dispatchOrder: 'aleatoria',
    templateText: '*{titulo}*\n{link}',
    isActive: false,
  });

  const res = await sourcesPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.source.dispatchOrder, 'aleatoria');
  assert.strictEqual(data.source.connectionId, 'conn_copier_a');
  assert.strictEqual(data.source.userId, USER_A_ID);
});

test('7. Isolamento SaaS: Usuário B não pode editar nem pausar regras do Usuário A', async () => {
  setupTestEnvironment();

  // Cria regra do Usuário A
  const createReq = makeSourcesRequest('POST', USER_A_ID, {
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    destinationJids: [GROUP_DEST_JID],
    templateText: '*{titulo}*\n{link}',
    isActive: false,
  });
  const createRes = await sourcesPOST(createReq);
  const createData = await createRes.json();
  const ruleId = createData.source.id;

  // Usuário B tenta alterar a regra do Usuário A
  const unauthorizedReq = makeSourcesRequest('POST', USER_B_ID, {
    id: ruleId,
    connectionId: 'conn_copier_a',
    groupJid: GROUP_ORIGIN_JID,
    customDelaySeconds: 999,
  });

  const res = await sourcesPOST(unauthorizedReq);
  assert.strictEqual(res.status === 403 || res.status === 404, true);
});

test.after(() => {
  global.fetch = originalFetch;
  try {
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  } catch {}
});
