import test from 'node:test';
import assert from 'node:assert';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { NextRequest } from 'next/server';
import { GET as connectionsGET, POST as connectionsPOST } from '@/app/api/whatsapp/connections/route';
import {
  readDatabase,
  writeDatabase,
  getInitialDatabase,
  saveWhatsAppConnection,
  listWhatsAppConnections,
  getWhatsAppConnection,
} from '@/lib/server/storage';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/server/auth';
import { WhatsAppConnection } from '@/lib/types';

// -----------------------------------------------------------------------------
// ISOLAMENTO TOTAL: Banco temporário em arquivo efêmero em os.tmpdir()
// O arquivo real .data/radar_db.json e as contas reais NUNCA são tocados!
// -----------------------------------------------------------------------------
const tempDbPath = path.join(
  os.tmpdir(),
  `radar_connections_isolated_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
);
process.env.RADAR_DB_PATH = tempDbPath;
process.env.TEST_ISOLATION = 'true';
process.env.EVOLUTION_BASE_URL = 'https://radar-whatsapp-gateway.onrender.com';
process.env.EVOLUTION_API_KEY = 'test_key';
process.env.EVOLUTION_INSTANCE_NAME = 'radar_ofertas';

const originalFetch = global.fetch;

const USER_A_ID = '11111111-1111-4111-8111-111111111111';
const USER_B_ID = '22222222-2222-4222-8222-222222222222';

function makeAuthCookie(userId: string) {
  const token = signSession({
    userId,
    email: `user_${userId.slice(0, 5)}@radar.com`,
    role: 'admin',
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function makeRequest(
  method: 'GET' | 'POST',
  userId: string,
  body?: any,
  query?: Record<string, string>
) {
  const url = new URL('https://painel-de-ofertas.vercel.app/api/whatsapp/connections');
  if (query) {
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  return new NextRequest(url.toString(), {
    method,
    headers: {
      cookie: makeAuthCookie(userId),
      'content-type': 'application/json',
      host: 'painel-de-ofertas.vercel.app',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  const initial = getInitialDatabase();
  initial.whatsapp.baseUrl = 'https://radar-whatsapp-gateway.onrender.com';
  initial.whatsapp.apiKey = 'test_key';
  initial.whatsapp.instanceName = 'radar_ofertas';
  // Configura conexões limpas de teste
  initial.connections = [
    {
      id: 'conn_default_user_a',
      userId: USER_A_ID,
      label: 'Perfil 1',
      instanceName: 'radar_user_a_perfil1',
      baseUrl: 'https://radar-whatsapp-gateway.onrender.com',
      apiKey: 'test_key',
      status: 'disconnected',
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'conn_secondary_user_a',
      userId: USER_A_ID,
      label: 'Chip Secundário',
      instanceName: 'radar_user_a_chip2',
      baseUrl: 'https://radar-whatsapp-gateway.onrender.com',
      apiKey: 'test_key',
      status: 'disconnected',
      phoneNumber: '5511999998888',
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'conn_user_b',
      userId: USER_B_ID,
      label: 'WhatsApp do Usuário B',
      instanceName: 'radar_user_b_inst1',
      baseUrl: 'https://radar-whatsapp-gateway.onrender.com',
      apiKey: 'test_key',
      status: 'connected',
      phoneNumber: '5521977776666',
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Adiciona fontes/regras e jobs atrelados à conn_default_user_a
  initial.sources = [
    {
      id: 'source_rule_1',
      userId: USER_A_ID,
      connectionId: 'conn_default_user_a',
      groupJid: '120363000000000001@g.us',
      name: 'Grupo Origem VIP',
      operationMode: 'copy_source',
      isActive: true,
      allowedStores: ['shopee'],
      stripThirdPartyLinks: true,
      stripExternalTags: true,
      customDelaySeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  initial.jobs = [
    {
      id: 'job_history_1',
      userId: USER_A_ID,
      connectionId: 'conn_default_user_a',
      originType: 'copiador',
      targetJid: '120363000000000002@g.us',
      targetName: 'Grupo Destino',
      messageText: 'Oferta enviada no passado',
      mediaType: 'none',
      originalUrl: 'https://shopee.com.br/item1',
      affiliateUrl: 'https://shope.ee/item1',
      scheduledFor: new Date().toISOString(),
      status: 'enviado',
      attempts: 1,
      maxAttempts: 3,
      linkVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  fs.writeFileSync(tempDbPath, JSON.stringify(initial, null, 2), 'utf-8');
});

test.afterEach(() => {
  global.fetch = originalFetch;
});

test.after(() => {
  try {
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  } catch {}
});

// -----------------------------------------------------------------------------
// CENÁRIO 1: Conectar um cadastro existente
// -----------------------------------------------------------------------------
test('Cenário 1: Conectar cadastro existente gera QR Code válido e atualiza status', async () => {
  global.fetch = async (url: any, opts: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/instance/connectionState/radar_user_a_perfil1')) {
      return new Response(JSON.stringify({ instance: { state: 'close' } }), { status: 200 });
    }
    if (urlStr.includes('/instance/connect/radar_user_a_perfil1')) {
      return new Response(JSON.stringify({ base64: 'data:image/png;base64,TEST_QR_VALID_123' }), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  const req = makeRequest('POST', USER_A_ID, {
    action: 'reconnect',
    connectionId: 'conn_default_user_a',
  });

  const res = await connectionsPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.status, 'qrcode');
  assert.strictEqual(data.qrCodeBase64, 'data:image/png;base64,TEST_QR_VALID_123');
  assert.strictEqual(data.qrcode?.base64, 'data:image/png;base64,TEST_QR_VALID_123');

  // Verifica que o cadastro persistido foi atualizado
  const db = readDatabase();
  const conn = db.connections.find((c) => c.id === 'conn_default_user_a');
  assert.strictEqual(conn?.status, 'qrcode');
  assert.strictEqual(conn?.qrCodeBase64, 'data:image/png;base64,TEST_QR_VALID_123');
});

// -----------------------------------------------------------------------------
// CENÁRIO 2: Recuperar cadastro cuja instância foi removida no gateway (404)
// -----------------------------------------------------------------------------
test('Cenário 2: Recupera cadastro órfão (404 no gateway) reparando a instância automaticamente', async () => {
  let instanceCreated = false;
  let webhookConfigured = false;

  global.fetch = async (url: any, opts: any) => {
    const urlStr = String(url);

    // Consulta de estado retorna 404 (instância inexistente no gateway)
    if (urlStr.includes('/instance/connectionState/radar_user_a_perfil1')) {
      return new Response(JSON.stringify({ message: 'Instance not found' }), { status: 404 });
    }

    // Chamada de criação/reparo da instância
    if (urlStr.includes('/instance/create')) {
      instanceCreated = true;
      return new Response(
        JSON.stringify({
          instance: { name: 'radar_user_a_perfil1' },
          qrcode: { base64: 'data:image/png;base64,REPAIRED_QR_456' },
        }),
        { status: 201 }
      );
    }

    // Configuração do webhook
    if (urlStr.includes('/webhook/set/radar_user_a_perfil1')) {
      webhookConfigured = true;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  };

  const req = makeRequest('POST', USER_A_ID, {
    action: 'reconnect',
    connectionId: 'conn_default_user_a',
  });

  const res = await connectionsPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.repaired, true);
  assert.strictEqual(data.status, 'qrcode');
  assert.strictEqual(data.qrCodeBase64, 'data:image/png;base64,REPAIRED_QR_456');
  assert.strictEqual(instanceCreated, true, 'Instância remota deve ter sido criada para reparar o vínculo');
  assert.strictEqual(webhookConfigured, true, 'Webhook deve ter sido configurado para a instância reparada');
});

// -----------------------------------------------------------------------------
// CENÁRIO 3: Renovar QR code expirado
// -----------------------------------------------------------------------------
test('Cenário 3: Polling de QR code renova o código se expirado sem quebrar estado', async () => {
  global.fetch = async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/instance/connectionState/')) {
      return new Response(JSON.stringify({ state: 'connecting' }), { status: 200 });
    }
    if (urlStr.includes('/instance/connect/')) {
      return new Response(JSON.stringify({ base64: 'data:image/png;base64,FRESH_RENEWED_QR_789' }), {
        status: 200,
      });
    }
    return new Response('Not found', { status: 404 });
  };

  const req = makeRequest('POST', USER_A_ID, {
    action: 'poll_qr',
    connectionId: 'conn_default_user_a',
  });

  const res = await connectionsPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.connected, false);
  assert.strictEqual(data.qrCodeBase64, 'data:image/png;base64,FRESH_RENEWED_QR_789');
  assert.strictEqual(data.qrcode?.base64, 'data:image/png;base64,FRESH_RENEWED_QR_789');
});

// -----------------------------------------------------------------------------
// CENÁRIO 4: Reconhecer instância já conectada
// -----------------------------------------------------------------------------
test('Cenário 4: Reconhece instância já conectada no WhatsApp sem reiniciar pareamento', async () => {
  let createCalled = false;

  global.fetch = async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/instance/connectionState/')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
    }
    if (urlStr.includes('/instance/fetchInstances')) {
      return new Response(
        JSON.stringify([
          {
            name: 'radar_user_a_perfil1',
            ownerJid: '5519999887766@s.whatsapp.net',
            profileName: 'Meu Canal Oficial',
            profilePicUrl: 'https://example.com/pic.jpg',
          },
        ]),
        { status: 200 }
      );
    }
    if (urlStr.includes('/instance/create') || urlStr.includes('/instance/connect')) {
      createCalled = true;
    }
    return new Response('Not found', { status: 404 });
  };

  const req = makeRequest('POST', USER_A_ID, {
    action: 'reconnect',
    connectionId: 'conn_default_user_a',
  });

  const res = await connectionsPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.alreadyConnected, true);
  assert.strictEqual(data.status, 'connected');
  assert.strictEqual(data.phoneNumber, '5519999887766');
  assert.strictEqual(data.profileName, 'Meu Canal Oficial');
  assert.strictEqual(createCalled, false, 'Não deve solicitar outro pareamento para instância conectada');
});

// -----------------------------------------------------------------------------
// CENÁRIO 5: Excluir conexão padrão (pausar regras, preservar histórico e não migrar silenciosamente)
// -----------------------------------------------------------------------------
test('Cenário 5: Excluir conexão padrão pausa regras ativas e preserva histórico de mensagens', async () => {
  let gatewayDeleted = false;

  global.fetch = async (url: any, opts: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/instance/delete/radar_user_a_perfil1') && opts?.method === 'DELETE') {
      gatewayDeleted = true;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  const req = makeRequest('POST', USER_A_ID, {
    action: 'delete',
    connectionId: 'conn_default_user_a',
  });

  const res = await connectionsPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(gatewayDeleted, true, 'Deve solicitar exclusão da instância na Evolution');

  const db = readDatabase();
  // Conexão conn_default_user_a deve ter sido removida
  const remaining = db.connections.filter((c) => c.userId === USER_A_ID);
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].id, 'conn_secondary_user_a');
  assert.strictEqual(remaining[0].isDefault, true, 'Restante vira padrão para novas ações');

  // REGRA SAAS: A regra vinculada à conta excluída deve ser PAUSADA, NÃO transferida silenciosamente para o chip 2!
  const rule = db.sources.find((s) => s.id === 'source_rule_1');
  assert.strictEqual(rule?.isActive, false, 'Regra deve ser pausada para impedir envios');
  assert.strictEqual(rule?.connectionId, undefined, 'Regra não pode estar vinculada silenciosamente ao novo chip');

  // Histórico preservado
  const job = db.jobs.find((j) => j.id === 'job_history_1');
  assert.ok(job, 'O job histórico deve ser preservado');
  assert.strictEqual(job?.status, 'enviado');
  assert.strictEqual(job?.connectionId, undefined, 'ConnectionId desvinculado no job preservado');
});

// -----------------------------------------------------------------------------
// CENÁRIO 6: Excluir cadastro sem instância remota (gateway 404)
// -----------------------------------------------------------------------------
test('Cenário 6: Excluir cadastro cuja instância já não existe no gateway (404) conclui com sucesso', async () => {
  global.fetch = async (url: any) => {
    // Gateway retorna 404 Not Found para delete (já não existia)
    return new Response(JSON.stringify({ message: 'Instance not found' }), { status: 404 });
  };

  const req = makeRequest('POST', USER_A_ID, {
    action: 'delete',
    connectionId: 'conn_secondary_user_a',
  });

  const res = await connectionsPOST(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.gatewayDeleted, true);

  const db = readDatabase();
  const found = db.connections.find((c) => c.id === 'conn_secondary_user_a');
  assert.strictEqual(found, undefined, 'Cadastro deve ter sido removido do banco');
});

// -----------------------------------------------------------------------------
// CENÁRIO 7: Tratar gateway indisponível sem falso sucesso
// -----------------------------------------------------------------------------
test('Cenário 7: Gateway indisponível rejeita exclusão com erro 502 e oferece opção de forceLocalOnly', async () => {
  global.fetch = async () => {
    throw new Error('Connection refused by gateway host');
  };

  // 7a. Tentativa padrão sem forceLocalOnly
  const req1 = makeRequest('POST', USER_A_ID, {
    action: 'delete',
    connectionId: 'conn_default_user_a',
  });

  const res1 = await connectionsPOST(req1);
  const data1 = await res1.json();

  assert.strictEqual(res1.status, 502);
  assert.strictEqual(data1.ok, false);
  assert.strictEqual(data1.canForceLocal, true);
  assert.strictEqual(data1.reason, 'gateway_unavailable');

  // Confirma que a conta NÃO foi apagada no banco falso sucesso
  const db1 = readDatabase();
  const conn1 = db1.connections.find((c) => c.id === 'conn_default_user_a');
  assert.ok(conn1, 'Conta deve permanecer salva até confirmação explícita');

  // 7b. Tentativa com forceLocalOnly = true (remoção confirmada apenas do painel)
  const req2 = makeRequest('POST', USER_A_ID, {
    action: 'delete',
    connectionId: 'conn_default_user_a',
    forceLocalOnly: true,
  });

  const res2 = await connectionsPOST(req2);
  const data2 = await res2.json();

  assert.strictEqual(res2.status, 200);
  assert.strictEqual(data2.ok, true);
  assert.strictEqual(data2.partial, true);
  assert.ok(data2.warning, 'Deve conter aviso de remoção parcial');

  const db2 = readDatabase();
  const conn2 = db2.connections.find((c) => c.id === 'conn_default_user_a');
  assert.strictEqual(conn2, undefined, 'Após forceLocalOnly a conta é removida do painel');
});

// -----------------------------------------------------------------------------
// CENÁRIO 8: Confirmar que a exclusão persiste após recarregar a página
// -----------------------------------------------------------------------------
test('Cenário 8: Conexão excluída não reaparece após nova leitura/recarregamento do banco (sem re-seed)', async () => {
  // Usuário exclui todas as suas conexões
  const db = readDatabase();
  db.connections = db.connections.filter((c) => c.userId !== USER_A_ID);
  writeDatabase(db);

  // Simula o GET /api/whatsapp/connections como na atualização da página
  const req = makeRequest('GET', USER_A_ID);
  const res = await connectionsGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.connections.length, 0, 'Não deve reaparecer nenhuma conexão por seed automático');
});

// -----------------------------------------------------------------------------
// CENÁRIO 9: Impedir operações entre clientes diferentes (Isolamento SaaS)
// -----------------------------------------------------------------------------
test('Cenário 9: Usuário A não pode consultar, reconectar ou excluir conexão do Usuário B', async () => {
  // 9a. Tentativa de exclusão cruzada
  const reqDelete = makeRequest('POST', USER_A_ID, {
    action: 'delete',
    connectionId: 'conn_user_b', // Conexão que pertence ao USER_B
  });

  const resDel = await connectionsPOST(reqDelete);
  assert.strictEqual(resDel.status, 404, 'Não deve encontrar nem permitir excluir conexão de outro usuário');

  // 9b. Tentativa de reconexão cruzada
  const reqReconnect = makeRequest('POST', USER_A_ID, {
    action: 'reconnect',
    connectionId: 'conn_user_b',
  });

  const resRec = await connectionsPOST(reqReconnect);
  assert.strictEqual(resRec.status, 404, 'Não deve permitir reconectar conexão de outro usuário');

  // 9c. Listagem do Usuário A não deve conter conexões do Usuário B
  const reqList = makeRequest('GET', USER_A_ID);
  const resList = await connectionsGET(reqList);
  const dataList = await resList.json();

  assert.strictEqual(resList.status, 200);
  const containsUserB = dataList.connections.some((c: any) => c.id === 'conn_user_b');
  assert.strictEqual(containsUserB, false, 'Listagem do Usuário A não deve listar conexões do Usuário B');
});
