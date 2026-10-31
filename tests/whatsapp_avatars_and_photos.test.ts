import test from 'node:test';
import assert from 'node:assert';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { NextRequest } from 'next/server';
import { GET as photoGET } from '@/app/api/whatsapp/groups/photo/route';
import { safeWhatsAppPictureUrl } from '@/lib/server/whatsapp-picture';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/server/auth';
import { writeDatabase, getInitialDatabase } from '@/lib/server/storage';
import { WhatsAppConnection } from '@/lib/types';

// Configuração de ambiente de teste estritamente isolado
const tempDbPath = path.join(
  os.tmpdir(),
  `radar_photos_isolated_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
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
const GROUP_1_JID = '120363000000000001@g.us';

function makeAuthCookie(userId: string) {
  const token = signSession({
    userId,
    email: `user_${userId.slice(0, 5)}@radar.com`,
    role: 'admin',
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function makePhotoRequest(userId: string, query: Record<string, string>) {
  const url = new URL('https://painel-de-ofertas.vercel.app/api/whatsapp/groups/photo');
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

  return new NextRequest(url.toString(), {
    method: 'GET',
    headers: {
      cookie: makeAuthCookie(userId),
    },
  });
}

function setupTestDatabase() {
  const initial = getInitialDatabase();
  const connA: WhatsAppConnection = {
    id: 'conn_test_a',
    userId: USER_A_ID,
    instanceName: 'inst_user_a',
    baseUrl: 'https://radar-whatsapp-gateway.onrender.com',
    apiKey: 'test_key',
    label: 'Conexão Teste A',
    status: 'connected',
    isDefault: true,
    phoneNumber: '5511999990001',
    ownerJid: OWNER_A_JID,
    profileName: 'Muryllo Oficial',
    profilePicUrl: undefined, // Perfil sem foto salva inicialmente
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  initial.connections = [connA];
  writeDatabase(initial);
}

test('1. Perfil sem URL salva: busca a foto real no gateway da conexão', async () => {
  setupTestDatabase();

  global.fetch = async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (urlStr.includes('/instance/connectionState/')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
    }
    if (urlStr.includes('/instance/fetchInstances')) {
      return new Response(JSON.stringify([{
        name: 'inst_user_a',
        connectionStatus: 'open',
        ownerJid: OWNER_A_JID,
      }]), { status: 200 });
    }
    if (urlStr.includes('/chat/fetchProfilePictureUrl/inst_user_a')) {
      return new Response(
        JSON.stringify({
          profilePictureUrl: 'https://pps.whatsapp.net/v/t61.24694-24/avatar_real_user_a.jpg',
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({}), { status: 404 });
  };

  const req = makePhotoRequest(USER_A_ID, {
    account: '1',
    connectionId: 'conn_test_a',
    ownerJid: OWNER_A_JID,
  });

  const res = await photoGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.pictureUrl, 'https://pps.whatsapp.net/v/t61.24694-24/avatar_real_user_a.jpg');
});

test('2. Foto de grupo com groupJid, connectionId e ownerJid', async () => {
  setupTestDatabase();

  global.fetch = async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (urlStr.includes('/instance/connectionState/')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
    }
    if (urlStr.includes('/instance/fetchInstances')) {
      return new Response(JSON.stringify([{
        name: 'inst_user_a',
        connectionStatus: 'open',
        ownerJid: OWNER_A_JID,
      }]), { status: 200 });
    }
    if (urlStr.includes('/group/fetchAllGroups/')) {
      return new Response(JSON.stringify([
        {
          id: GROUP_1_JID,
          subject: 'Grupo Ofertas VIP',
          pictureUrl: 'https://pps.whatsapp.net/v/t61.24694-24/group1_metadata.jpg',
        },
      ]), { status: 200 });
    }

    return new Response(JSON.stringify({}), { status: 404 });
  };

  const req = makePhotoRequest(USER_A_ID, {
    groupJid: GROUP_1_JID,
    connectionId: 'conn_test_a',
    ownerJid: OWNER_A_JID,
  });

  const res = await photoGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.pictureUrl, 'https://pps.whatsapp.net/v/t61.24694-24/group1_metadata.jpg');
});

test('3. URL expirada com refresh=1: contorna metadados e cache para buscar nova URL no gateway', async () => {
  setupTestDatabase();

  let gatewayFetchCalled = false;
  global.fetch = async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (urlStr.includes('/instance/connectionState/')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
    }
    if (urlStr.includes('/instance/fetchInstances')) {
      return new Response(JSON.stringify([{
        name: 'inst_user_a',
        connectionStatus: 'open',
        ownerJid: OWNER_A_JID,
      }]), { status: 200 });
    }
    if (urlStr.includes('/group/fetchAllGroups/')) {
      return new Response(JSON.stringify([
        {
          id: GROUP_1_JID,
          subject: 'Grupo Ofertas VIP',
          pictureUrl: 'https://pps.whatsapp.net/v/t61.24694-24/expired_token.jpg',
        },
      ]), { status: 200 });
    }
    if (urlStr.includes('/chat/fetchProfilePictureUrl/inst_user_a')) {
      gatewayFetchCalled = true;
      return new Response(
        JSON.stringify({
          profilePictureUrl: 'https://pps.whatsapp.net/v/t61.24694-24/fresh_renovated_token.jpg',
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({}), { status: 404 });
  };

  const req = makePhotoRequest(USER_A_ID, {
    groupJid: GROUP_1_JID,
    connectionId: 'conn_test_a',
    ownerJid: OWNER_A_JID,
    refresh: '1',
  });

  const res = await photoGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(gatewayFetchCalled, true, 'O gateway deve ter sido consultado diretamente com refresh=1');
  assert.strictEqual(data.pictureUrl, 'https://pps.whatsapp.net/v/t61.24694-24/fresh_renovated_token.jpg');
});

test('4. Foto privada ou inexistente no gateway (400/404): retorna pictureUrl=null sem quebrar o painel', async () => {
  setupTestDatabase();

  global.fetch = async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (urlStr.includes('/instance/connectionState/')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
    }
    if (urlStr.includes('/instance/fetchInstances')) {
      return new Response(JSON.stringify([{
        name: 'inst_user_a',
        connectionStatus: 'open',
        ownerJid: OWNER_A_JID,
      }]), { status: 200 });
    }
    if (urlStr.includes('/chat/fetchProfilePictureUrl/inst_user_a')) {
      return new Response(JSON.stringify({ status: 404, message: 'Profile picture not found or private' }), { status: 404 });
    }

    return new Response(JSON.stringify({}), { status: 404 });
  };

  const req = makePhotoRequest(USER_A_ID, {
    account: '1',
    connectionId: 'conn_test_a',
    ownerJid: OWNER_A_JID,
  });

  const res = await photoGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.pictureUrl, null, 'Foto privada/não definida deve retornar pictureUrl=null para ícone neutro');
});

test('5. Isolamento SaaS: Usuário B não pode consultar foto de conexão do Usuário A', async () => {
  setupTestDatabase();

  const req = makePhotoRequest(USER_B_ID, {
    account: '1',
    connectionId: 'conn_test_a',
    ownerJid: OWNER_A_JID,
  });

  const res = await photoGET(req);
  assert.strictEqual(res.status === 404 || res.status === 403, true, 'Deve barrar acesso a conexão de outro usuário');
});

test('6. Validação de identidade conectada: se ownerJid divergir do gateway, retorna 409', async () => {
  setupTestDatabase();

  global.fetch = async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (urlStr.includes('/instance/connectionState/')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
    }
    if (urlStr.includes('/instance/fetchInstances')) {
      return new Response(JSON.stringify([{
        name: 'inst_user_a',
        connectionStatus: 'open',
        ownerJid: '5511888880002@s.whatsapp.net', // Número diferente no gateway
      }]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  };

  const req = makePhotoRequest(USER_A_ID, {
    account: '1',
    connectionId: 'conn_test_a',
    ownerJid: OWNER_A_JID, // Esperava OWNER_A_JID antigo
  });

  const res = await photoGET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 409);
  assert.strictEqual(data.code, 'ACCOUNT_CHANGED');
});

test('7. Validador safeWhatsAppPictureUrl: rejeita URLs perigosas e aceita apenas WhatsApp CDN seguro', () => {
  assert.strictEqual(safeWhatsAppPictureUrl('https://pps.whatsapp.net/v/t61.24694-24/12345.jpg'), 'https://pps.whatsapp.net/v/t61.24694-24/12345.jpg');
  assert.strictEqual(safeWhatsAppPictureUrl('https://mmg.whatsapp.net/o1/v/t24/6789.jpg'), 'https://mmg.whatsapp.net/o1/v/t24/6789.jpg');
  assert.strictEqual(safeWhatsAppPictureUrl('https://static.whatsapp.com/rsrc.php/v3/yO/r/xyz.png'), 'https://static.whatsapp.com/rsrc.php/v3/yO/r/xyz.png');

  // Rejeições de segurança
  assert.strictEqual(safeWhatsAppPictureUrl('javascript:alert(1)'), null);
  assert.strictEqual(safeWhatsAppPictureUrl('http://pps.whatsapp.net/insecure.jpg'), null, 'Rejeita HTTP não criptografado');
  assert.strictEqual(safeWhatsAppPictureUrl('https://malicious-site.com/fake.jpg'), null, 'Rejeita domínios de terceiros');
  assert.strictEqual(safeWhatsAppPictureUrl('https://whatsapp.net.evil.com/fake.jpg'), null, 'Rejeita subdomínios forjados');
  assert.strictEqual(safeWhatsAppPictureUrl(''), null);
  assert.strictEqual(safeWhatsAppPictureUrl(null), null);
  assert.strictEqual(safeWhatsAppPictureUrl(undefined), null);
});

test.after(() => {
  global.fetch = originalFetch;
  try {
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  } catch {}
});
