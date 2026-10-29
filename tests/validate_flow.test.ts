import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { NextRequest } from 'next/server';
import {
  readDatabase,
  writeDatabase,
  getInitialDatabase,
  getActiveEvolutionConfig,
  diagnoseEvolutionError,
} from '../src/lib/server/storage';
import { GET as getWhatsAppConnect, POST as postWhatsAppConnect } from '../src/app/api/whatsapp/connect/route';
import { GET as getWhatsAppGroups, POST as postWhatsAppGroups } from '../src/app/api/whatsapp/groups/route';

// -----------------------------------------------------------------------------
// ISOLAMENTO TOTAL: Banco temporário efêmero em os.tmpdir()
// O arquivo real .data/radar_db.json NUNCA é lido nem modificado durante estes testes
// -----------------------------------------------------------------------------
const tempDbPath = path.join(
  os.tmpdir(),
  `radar_flow_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
);
process.env.RADAR_DB_PATH = tempDbPath;
const initialDb = getInitialDatabase();
initialDb.whatsapp.instanceName = 'radar_ofertas';
initialDb.whatsapp.baseUrl = 'https://evolution-api-radar.onrender.com';
initialDb.whatsapp.apiKey = 'test_api_key_isolated';
writeDatabase(initialDb);

const originalFetch = global.fetch;
test.before(() => {
  process.env.RADAR_DB_PATH = tempDbPath;
  const db = getInitialDatabase();
  db.whatsapp.instanceName = 'radar_ofertas';
  db.whatsapp.baseUrl = 'https://evolution-api-radar.onrender.com';
  db.whatsapp.apiKey = 'test_api_key_isolated';
  writeDatabase(db);

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/instance/connectionState/radar_ofertas')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
    }
    if (url.includes('/instance/fetchInstances')) {
      return new Response(
        JSON.stringify([
          {
            name: 'radar_ofertas',
            connectionStatus: 'open',
            ownerJid: '556282582400@s.whatsapp.net',
            profileName: 'Radar de Ofertas',
          },
        ]),
        { status: 200 }
      );
    }
    if (url.includes('/group/fetchAllGroups/radar_ofertas')) {
      return new Response(
        JSON.stringify([
          { id: '120363001@g.us', subject: 'Grupo Real 1', size: 100, announce: false, participants: [] },
          { id: '120363002@g.us', subject: 'Grupo Real 2', size: 80, announce: false, participants: [] },
          { id: '120363003@g.us', subject: 'Grupo Real 3', size: 60, announce: false, participants: [] },
          { id: '120363004@g.us', subject: 'Grupo Real 4', size: 50, announce: false, participants: [] },
          { id: '120363005@g.us', subject: 'Grupo Real 5', size: 40, announce: false, participants: [] },
        ]),
        { status: 200 }
      );
    }
    return originalFetch(input, init);
  };
});

test.after(() => {
  global.fetch = originalFetch;
  try {
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  } catch {}
  delete process.env.RADAR_DB_PATH;
});

test('1. Resolução de precedência de instância e eliminação de fallback silencioso', () => {
  // Cenário A: banco com radar_ofertas
  const cfgA = getActiveEvolutionConfig({
    id: 'test',
    userId: 'u',
    instanceName: 'radar_ofertas',
    baseUrl: 'https://test.com',
    apiKey: 'k',
    status: 'connected',
    phoneNumber: '',
    profileName: '',
    batteryLevel: 100,
    updatedAt: '',
  });
  assert.equal(cfgA.instanceName, 'radar_ofertas');

  // Cenário B: banco vazio, env com radar_ofertas
  const originalEnv = process.env.EVOLUTION_INSTANCE_NAME;
  process.env.EVOLUTION_INSTANCE_NAME = 'radar_ofertas_env';
  const cfgB = getActiveEvolutionConfig({
    id: 'test',
    userId: 'u',
    instanceName: '',
    baseUrl: '',
    apiKey: '',
    status: 'disconnected',
    phoneNumber: '',
    profileName: '',
    batteryLevel: 100,
    updatedAt: '',
  });
  assert.equal(cfgB.instanceName, 'radar_ofertas_env', 'Deve respeitar variável de ambiente quando banco vazio');

  // Cenário C: banco com antigo legado 'RadarInstancia1' e env configurado
  const cfgC = getActiveEvolutionConfig({
    id: 'test',
    userId: 'u',
    instanceName: 'RadarInstancia1',
    baseUrl: '',
    apiKey: '',
    status: 'disconnected',
    phoneNumber: '',
    profileName: '',
    batteryLevel: 100,
    updatedAt: '',
  });
  assert.equal(cfgC.instanceName, 'radar_ofertas_env', 'NÃO deve usar RadarInstancia1 silenciosamente quando env configurado');

  // Restaurar env
  if (originalEnv) process.env.EVOLUTION_INSTANCE_NAME = originalEnv;
  else delete process.env.EVOLUTION_INSTANCE_NAME;
});

test('2. Diagnósticos seguros de erro na Evolution API sem vazamento de dados sensíveis', () => {
  // 404 - Instância inexistente
  const diag404 = diagnoseEvolutionError(404, '{"error":"The RadarInstancia1 does not exist"}', null, 'RadarInstancia1');
  assert.equal(diag404.reason, 'instance_not_found');
  assert.ok(diag404.message.includes('não foi encontrada'));
  assert.ok(!diag404.message.includes('{"error"'));

  // 401 - Autenticação
  const diag401 = diagnoseEvolutionError(401, '{"error":"Unauthorized secret-key-xyz"}', null, 'radar_ofertas');
  assert.equal(diag401.reason, 'auth_error');
  assert.ok(diag401.message.includes('chave de API (apikey)'));
  assert.ok(!diag401.message.includes('secret-key-xyz'));

  // Timeout / Abort
  const diagTimeout = diagnoseEvolutionError(null, '', new Error('The operation was aborted due to timeout'), 'radar_ofertas');
  assert.equal(diagTimeout.reason, 'timeout');
  assert.ok(diagTimeout.message.includes('demorou'));

  // 503 - Indisponibilidade
  const diag503 = diagnoseEvolutionError(503, 'Service Unavailable', null, 'radar_ofertas');
  assert.equal(diag503.reason, 'unavailable');
  assert.ok(diag503.message.includes('temporariamente indisponível'));
});

test('3. Consulta do estado REAL da instância ao abrir a tela (GET /api/whatsapp/connect?check=true)', async () => {
  const req = new NextRequest('http://localhost:3000/api/whatsapp/connect?check=true');
  const res = await getWhatsAppConnect(req);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.whatsapp.instanceName, 'radar_ofertas');
  assert.equal(data.whatsapp.status, 'connected');
  assert.equal(data.whatsapp.hasApiKey, true);
  assert.equal(data.whatsapp.apiKey, undefined, 'A chave de API NUNCA deve ser enviada ao cliente');
});

test('4. Proteção de pareamento quando a instância já está conectada (não desconecta nem gera novo QR)', async () => {
  const pairReq = new NextRequest('http://localhost:3000/api/whatsapp/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start_pairing' }),
  });
  const pairRes = await postWhatsAppConnect(pairReq);
  const pairData = await pairRes.json();

  assert.equal(pairRes.status, 200);
  assert.equal(pairData.ok, true);
  assert.equal(pairData.alreadyConnected, true);
  assert.equal(pairData.whatsapp.status, 'connected');
});

test('5. Sincronização ao vivo da lista real de grupos pelo nome (GET /api/whatsapp/groups?refresh=true)', async () => {
  const groupsReq = new NextRequest('http://localhost:3000/api/whatsapp/groups?refresh=true');
  const groupsRes = await getWhatsAppGroups(groupsReq);
  const groupsData = await groupsRes.json();

  assert.equal(groupsRes.status, 200);
  assert.equal(groupsData.ok, true);
  assert.ok(Array.isArray(groupsData.groups));
  assert.ok(groupsData.total >= 5, 'Deve carregar grupos reais da Evolution');
  assert.ok(groupsData.groups.some((g: { name: string }) => g.name.length > 0));
});

test('6. Seleção e persistência de Origem e Destino em banco isolado temporário', async () => {
  // Opera EXCLUSIVAMENTE sobre o banco temporário isolado
  const db = readDatabase();
  assert.ok(db.groups.length >= 2, 'Necessário pelo menos 2 grupos para testar origem e destino');

  const originGroup = db.groups[0];
  const destinationGroup =
    db.groups.find((g: { canPost?: boolean; groupJid: string }) => g.canPost !== false && g.groupJid !== originGroup.groupJid) ||
    db.groups[1];
  destinationGroup.canPost = true;
  writeDatabase(db);

  const setOriginReq = new NextRequest('http://localhost:3000/api/whatsapp/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'toggle_role',
      groupJid: originGroup.groupJid,
      isOrigin: true,
    }),
  });
  const setOriginRes = await postWhatsAppGroups(setOriginReq);
  const originData = await setOriginRes.json();
  assert.equal(originData.ok, true);
  assert.equal(originData.group.isOrigin, true);

  const setDestReq = new NextRequest('http://localhost:3000/api/whatsapp/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'toggle_role',
      groupJid: destinationGroup.groupJid,
      isDestination: true,
    }),
  });
  const setDestRes = await postWhatsAppGroups(setDestReq);
  const destData = await setDestRes.json();
  assert.equal(destData.ok, true);
  assert.equal(destData.group.isDestination, true);

  // Verificar persistência no banco temporário
  const checkGroupsReq = new NextRequest('http://localhost:3000/api/whatsapp/groups');
  const checkGroupsRes = await getWhatsAppGroups(checkGroupsReq);
  const checkData = await checkGroupsRes.json();

  const verifiedOrigin = checkData.groups.find((g: { groupJid: string }) => g.groupJid === originGroup.groupJid);
  const verifiedDest = checkData.groups.find((g: { groupJid: string }) => g.groupJid === destinationGroup.groupJid);

  assert.equal(verifiedOrigin?.isOrigin, true, 'Origem deve persistir no banco de teste');
  assert.equal(verifiedDest?.isDestination, true, 'Destino deve persistir no banco de teste');
});
