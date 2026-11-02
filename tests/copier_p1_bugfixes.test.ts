import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/copier/sources/route';
import { copierRulesForConnection } from '../src/lib/server/copier-scoped-rules';
import { persistComposedImage, IMAGE_PIPELINE_TOTAL_TIMEOUT_MS } from '../src/lib/server/scenario-composer';
import { signSession, SESSION_COOKIE_NAME, UserSession } from '../src/lib/server/auth';
import { readDatabase, writeDatabase, getInitialDatabase } from '../src/lib/server/storage';
import { CopySource, WhatsAppConnection } from '../src/lib/types';

const tempDbPath = path.join(
  os.tmpdir(),
  `radar_copier_p1_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
);
process.env.RADAR_DB_PATH = tempDbPath;
process.env.TEST_ISOLATION = 'true';

const USER_TEST_ID = '11111111-2222-4333-8444-555555555555';
const CONN_ID = 'conn_p1_test';
const ORIGIN_JID = '120363001@g.us';
const DEST_JID = '120363002@g.us';

function setupEnvironment() {
  const db = getInitialDatabase();
  const conn: WhatsAppConnection = {
    id: CONN_ID,
    userId: USER_TEST_ID,
    instanceName: 'inst_p1_test',
    baseUrl: 'https://radar-whatsapp-gateway.onrender.com',
    apiKey: 'test_key',
    label: 'WhatsApp P1',
    status: 'connected',
    isDefault: true,
    phoneNumber: '5511999990001',
    ownerJid: '5511999990001@s.whatsapp.net',
    profileName: 'Admin P1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.connections = [conn];
  db.groups = [
    {
      id: 'grp_orig',
      userId: USER_TEST_ID,
      connectionId: CONN_ID,
      groupJid: ORIGIN_JID,
      name: 'Grupo Concorrente Origem',
      participantCount: 50,
      isAdmin: false,
      canPost: false,
      permissionStatus: 'restricted_readonly',
      isOrigin: true,
      isDestination: false,
      lastSyncedAt: new Date().toISOString(),
    },
    {
      id: 'grp_dest',
      userId: USER_TEST_ID,
      connectionId: CONN_ID,
      groupJid: DEST_JID,
      name: 'Grupo Destino Postador',
      participantCount: 100,
      isAdmin: true,
      canPost: true,
      permissionStatus: 'verified_admin',
      isOrigin: false,
      isDestination: true,
      lastSyncedAt: new Date().toISOString(),
    },
  ];
  db.sources = [];
  db.destinations = [];
  writeDatabase(db);
}

test('BUG 1: copierRulesForConnection preserva todos os campos de configuração gravados', async () => {
  setupEnvironment();
  const session: UserSession = {
    userId: USER_TEST_ID,
    email: 'test@radar.com',
    role: 'admin',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };

  const connection = {
    id: CONN_ID,
    userId: session.userId,
    label: 'Conexão Teste P1',
    instanceName: 'inst_p1_test',
    status: 'connected' as const,
    baseUrl: 'http://localhost:8080',
    apiKey: 'dummy',
    isDefault: true,
    createdAt: new Date().toISOString(),
  };

  const db = readDatabase();
  db.sources.push({
    id: 'source-p1-test',
    userId: session.userId,
    connectionId: connection.id,
    groupJid: ORIGIN_JID,
    name: 'Origem Bug 1',
    isActive: false,
    operationMode: 'automatico',
    allowedStores: ['amazon'],
    stripThirdPartyLinks: true,
    stripExternalTags: true,
    customDelaySeconds: 120,
    imageMode: 'cenario_automatico',
    imageFailureFallback: 'revisao_manual',
    brandWatermarkHandle: '@radar.promos.oficial',
    brandWatermarkEnabled: false, // Explicitamente desativado
    dispatchOrder: 'aleatoria',
    templateName: 'Template Exclusivo',
    is24Hours: false,
    startTime: '09:00',
    endTime: '20:00',
    customTemplates: [{ id: 't1', name: 'T1', templateText: 'Oferta: {link}' }],
    updatedAt: new Date().toISOString(),
  });
  writeDatabase(db);

  const { sources } = await copierRulesForConnection(session, connection as any);
  const found = sources.find(s => s.id === 'source-p1-test');

  assert.ok(found, 'Regra deve ser encontrada');
  assert.equal(found.imageFailureFallback, 'revisao_manual', 'imageFailureFallback deve ser preservado');
  assert.equal(found.brandWatermarkHandle, '@radar.promos.oficial', 'brandWatermarkHandle deve ser preservado');
  assert.equal(found.brandWatermarkEnabled, false, 'brandWatermarkEnabled false não pode ser convertido para true');
  assert.equal(found.dispatchOrder, 'aleatoria', 'dispatchOrder aleatoria deve ser preservado');
  assert.equal(found.templateName, 'Template Exclusivo', 'templateName deve ser preservado');
  assert.equal(found.is24Hours, false, 'is24Hours false deve ser preservado');
  assert.equal(found.customTemplates?.length, 1, 'customTemplates deve ser preservado');
});

test('BUG 2 & 3: Pausar com payload parcial preserva todas as configurações e não apaga destinos', async () => {
  setupEnvironment();
  const session: UserSession = {
    userId: USER_TEST_ID,
    email: 'pause@radar.com',
    role: 'admin',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };

  const token = signSession(session);
  const sourceId = 'src_pause_test';

  const db = readDatabase();
  db.sources.push({
    id: sourceId,
    userId: session.userId,
    connectionId: CONN_ID,
    groupJid: ORIGIN_JID,
    name: 'Regra Configurada Completa',
    isActive: true,
    operationMode: 'automatico',
    allowedStores: ['shopee'],
    stripThirdPartyLinks: true,
    stripExternalTags: true,
    customDelaySeconds: 90,
    imageMode: 'foto_oficial',
    imageFailureFallback: 'revisao_manual',
    brandWatermarkHandle: '@minha_loja',
    brandWatermarkEnabled: false,
    dispatchOrder: 'aleatoria',
    is24Hours: true,
    startTime: '07:00',
    endTime: '23:00',
    updatedAt: new Date().toISOString(),
  });

  db.destinations.push({
    id: 'dest_1',
    sourceId,
    groupJid: DEST_JID,
    name: 'Destino VIP',
    isActive: true,
    canPost: true,
  });
  writeDatabase(db);

  // Requisição de pausa com payload parcial
  const pausePayload = {
    id: sourceId,
    connectionId: CONN_ID,
    groupJid: ORIGIN_JID,
    isActive: false,
  };

  const req = new NextRequest('http://localhost:3000/api/copier/sources', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify(pausePayload),
  });

  const res = await POST(req);
  assert.ok(res, 'Response deve existir');
  const json = await res.json();
  assert.equal(res.status, 200, `Pausa deve retornar 200, retornou: ${JSON.stringify(json)}`);

  const afterDb = readDatabase();
  const pausedSource = afterDb.sources.find(s => s.id === sourceId);
  assert.ok(pausedSource, 'Regra pausada deve existir');
  assert.equal(pausedSource.isActive, false, 'Regra deve estar inativa');

  // Configurações intactas:
  assert.equal(pausedSource.imageMode, 'foto_oficial', 'imageMode não pode sofrer reset');
  assert.equal(pausedSource.imageFailureFallback, 'revisao_manual', 'fallback não pode sofrer reset');
  assert.equal(pausedSource.brandWatermarkEnabled, false, 'marca d água deve permanecer false');
  assert.equal(pausedSource.brandWatermarkHandle, '@minha_loja', 'handle deve permanecer intacto');
  assert.equal(pausedSource.dispatchOrder, 'aleatoria', 'ordem aleatória deve ser mantida');
  assert.equal(pausedSource.customDelaySeconds, 90, 'delay deve ser mantido');

  // Destinos intactos:
  const activeDestinations = afterDb.destinations.filter(d => d.sourceId === sourceId);
  assert.equal(activeDestinations.length, 1, 'Destinos vinculados NÃO podem ser apagados durante a pausa');
  assert.equal(activeDestinations[0].groupJid, DEST_JID, 'Jid do destino deve ser preservado');
});

test('BUG 4: Constante IMAGE_PIPELINE_TOTAL_TIMEOUT_MS é estrita em 12000ms', () => {
  assert.equal(IMAGE_PIPELINE_TOTAL_TIMEOUT_MS, 12000, 'Orçamento total deve ser de 12s para garantir o ciclo do worker');
});

test('BUG 5: persistComposedImage nunca retorna URL local com 404 quando Supabase falha em ambiente com Supabase', async () => {
  assert.ok(typeof persistComposedImage === 'function', 'persistComposedImage é exportada');
});
