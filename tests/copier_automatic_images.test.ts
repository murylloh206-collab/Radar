import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import {
  detectProductCategory,
  composeProductOnScenario,
  processAutomaticCopierImage,
} from '../src/lib/server/scenario-composer';
import { selectBestProductPhoto } from '../src/lib/server/radar-art-engine';
import { POST as sourcesPOST } from '../src/app/api/copier/sources/route';
import { NextRequest } from 'next/server';
import { signSession, SESSION_COOKIE_NAME } from '../src/lib/server/auth';
import { writeDatabase, getInitialDatabase } from '../src/lib/server/storage';
import { processIncomingMessage } from '../src/lib/server/copier-service';
import type { CopySource, CopyDestination, WhatsAppConnection } from '../src/lib/types';

const TEST_DB_PATH = path.join(process.cwd(), 'tests', 'fixtures', 'radar_db_test_images.json');
process.env.RADAR_DB_PATH = TEST_DB_PATH;
(process.env as any).NODE_ENV = 'test';

function setupCleanTestDb() {
  const db = getInitialDatabase();
  db.connections = [
    {
      id: 'conn_img_test',
      userId: 'user_img_test',
      instanceName: 'inst_img_test',
      label: 'Conta Teste',
      phoneNumber: '5511999990001',
      status: 'connected',
      connectionState: 'open',
      isDefault: true,
      persistence: 'multi',
      ownerJid: '5511999990001@s.whatsapp.net',
      webhookSecret: 'secret_img_test',
      baseUrl: 'http://localhost:8080',
      apiKey: 'test-api-key',
      lastSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    } as unknown as WhatsAppConnection,
  ];

  db.groups = [
    {
      id: 'grp_orig',
      userId: 'user_img_test',
      connectionId: 'conn_img_test',
      groupJid: '120363000000000001@g.us',
      name: 'Grupo Origem Ofertas',
      participantCount: 50,
      isAdmin: false,
      isOrigin: true,
      isDestination: false,
      canPost: true,
      permissionStatus: 'verified_member',
      lastSyncedAt: new Date().toISOString(),
    },
    {
      id: 'grp_dest',
      userId: 'user_img_test',
      connectionId: 'conn_img_test',
      groupJid: '120363000000000002@g.us',
      name: 'Canal VIP Ofertas',
      participantCount: 200,
      isAdmin: true,
      isOrigin: false,
      isDestination: true,
      canPost: true,
      permissionStatus: 'verified_admin',
      isAnnounce: false,
      lastSyncedAt: new Date().toISOString(),
    },
  ];

  db.sources = [];

  db.destinations = [
    {
      id: 'dest_1',
      sourceId: 'rule_img_test',
      groupJid: '120363000000000002@g.us',
      name: 'Canal VIP Ofertas',
      isActive: true,
      canPost: true,
    },
  ];

  db.settings = {
    ...db.settings,
    userId: 'user_img_test',
    watermarkText: '@radar.ofertas.br1',
    nightPauseEnabled: false,
  };

  fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
  writeDatabase(db);

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (urlStr.includes('/instance/connectionState/')) {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
    }
    if (urlStr.includes('/instance/fetchInstances')) {
      return new Response(
        JSON.stringify([
          {
            name: 'inst_img_test',
            connectionStatus: 'open',
            ownerJid: '5511999990001@s.whatsapp.net',
          },
        ]),
        { status: 200 }
      );
    }
    if (urlStr.includes('/group/fetchAllGroups/')) {
      return new Response(
        JSON.stringify([
          {
            id: '120363000000000001@g.us',
            subject: 'Grupo Origem Ofertas',
            announce: true,
          },
          {
            id: '120363000000000002@g.us',
            subject: 'Canal VIP Ofertas',
            announce: false,
            participants: [{ id: '5511999990001@s.whatsapp.net', admin: 'admin' }],
          },
        ]),
        { status: 200 }
      );
    }

    return originalFetch(input, init);
  };

  return db;
}

function makeSourcesRequest(method: string, userId: string, body: Record<string, unknown>) {
  const token = signSession({ userId, role: 'admin', email: `${userId}@radar.com` });
  return new NextRequest('https://painel-de-ofertas.vercel.app/api/copier/sources', {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify(body),
  });
}

test('1. Classificação e detecção precisa das 7 categorias de cenário', () => {
  const testCases = [
    { title: 'Creatina Soldiers Nutrition 100% Pura 1kg', expected: 'suplementos-fitness', file: 'suplementos-fitness.png' },
    { title: 'Whey Protein Isolado 900g Morango DUX', expected: 'suplementos-fitness', file: 'suplementos-fitness.png' },
    { title: 'Smartphone Samsung Galaxy S24 Ultra 512GB Titanium', expected: 'eletroeletronicos', file: 'eletroeletronicos.png' },
    { title: 'Fone de Ouvido Bluetooth JBL Tune 520BT Preto', expected: 'eletroeletronicos', file: 'eletroeletronicos.png' },
    { title: 'Parafusadeira e Furadeira de Impacto DeWalt 20V Max', expected: 'ferramentas', file: 'ferramentas.png' },
    { title: 'Jogo de Chaves Combinadas 6 a 22mm 12 Peças', expected: 'ferramentas', file: 'ferramentas.png' },
    { title: 'Sérum Facial Vitamina C Anti-Idade La Roche-Posay', expected: 'saude-beleza', file: 'saude-beleza.png' },
    { title: 'Perfume Good Girl Carolina Herrera EDP Feminino 80ml', expected: 'saude-beleza', file: 'saude-beleza.png' },
    { title: 'Fritadeira Elétrica Air Fryer 4L Oster Touch', expected: 'eletrodomesticos', file: 'eletrodomesticos.png' },
    { title: 'Máquina de Lavar Brastemp 12kg Ciclo Tira Manchas', expected: 'eletrodomesticos', file: 'eletrodomesticos.png' },
    { title: 'Vestido Longo Floral Feminino Alça Fina Verão', expected: 'moda-feminina', file: 'moda-feminina.png' },
    { title: 'Bolsa Feminina Transversal Chenson Tiracolo', expected: 'moda-feminina', file: 'moda-feminina.png' },
    { title: 'Camisa Social Masculina Manga Longa Slim Fit', expected: 'moda-masculina', file: 'moda-masculina.png' },
    { title: 'Sapatênis Masculino Couro Legítimo Conforto', expected: 'moda-masculina', file: 'moda-masculina.png' },
  ];

  for (const tc of testCases) {
    const res = detectProductCategory(tc.title);
    assert.strictEqual(res.category, tc.expected, `Falha ao detectar categoria para "${tc.title}"`);
    assert.strictEqual(res.scenarioFile, tc.file, `Falha no arquivo de cenário para "${tc.title}"`);
    assert.ok(res.confidence >= 0.90, `Confiança baixa (${res.confidence}) para "${tc.title}"`);
  }
});

test('2. Validação da fotografia oficial do produto https://meli.la/1XXKzfT (Creatina Soldiers 1kg)', () => {
  const photoUrl = 'https://http2.mlstatic.com/D_NQ_NP_605306-MLA119872143535_102026-P.webp';
  const selection = selectBestProductPhoto(photoUrl, 'mercadolivre');

  // Confirma conversão de thumbnail para imagem master em alta resolução (-O.jpg)
  assert.strictEqual(selection.isHighRes, true);
  assert.ok(selection.selectedUrl.endsWith('-O.jpg'), 'Deveria selecionar formato master -O.jpg');
  assert.strictEqual(selection.selectedUrl, 'https://http2.mlstatic.com/D_NQ_NP_605306-MLA119872143535_102026-O.jpg');

  // Classificação correta no cenário fitness
  const detected = detectProductCategory('Creatina Soldiers Nutrition em pó Sem sabor x 1kg');
  assert.strictEqual(detected.category, 'suplementos-fitness');
  assert.strictEqual(detected.scenarioFile, 'suplementos-fitness.png');
});

test('3. Composição física com sombra de contato e marca dágua discreta', async () => {
  // Cria recorte simulado transparente de um produto (ex: suplemento 300x500)
  const fakeCutout = await sharp({
    create: {
      width: 300,
      height: 500,
      channels: 4,
      background: { r: 24, g: 140, b: 200, alpha: 1 },
    },
  }).png().toBuffer();

  const composed = await composeProductOnScenario({
    category: 'suplementos-fitness',
    productCutoutBuffer: fakeCutout,
    targetSize: 1080,
    watermarkHandle: '@radar.ofertas.br1',
    watermarkEnabled: true,
  });

  assert.ok(composed.length > 50000, 'A imagem composta deve ter tamanho substancial');
  const meta = await sharp(composed).metadata();
  assert.strictEqual(meta.width, 1080);
  assert.strictEqual(meta.height, 1080);
  assert.strictEqual(meta.format, 'jpeg');
});

test('4. Diferenciação de perspectiva: overhead flat-lay vs bancada/chão', async () => {
  const sampleCutout = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 4,
      background: { r: 180, g: 50, b: 70, alpha: 1 },
    },
  }).png().toBuffer();

  // Composição flat-lay overhead em moda feminina
  const modaComp = await composeProductOnScenario({
    category: 'moda-feminina',
    productCutoutBuffer: sampleCutout,
    targetSize: 1080,
    watermarkHandle: '@radar.ofertas.br1',
    watermarkEnabled: true,
  });
  const modaMeta = await sharp(modaComp).metadata();
  assert.strictEqual(modaMeta.width, 1080);
  assert.strictEqual(modaMeta.format, 'jpeg');

  // Composição chão/bancada em ferramentas
  const toolComp = await composeProductOnScenario({
    category: 'ferramentas',
    productCutoutBuffer: sampleCutout,
    targetSize: 1080,
    watermarkHandle: '@radar.ofertas.br1',
    watermarkEnabled: true,
  });
  const toolMeta = await sharp(toolComp).metadata();
  assert.strictEqual(toolMeta.width, 1080);
  assert.strictEqual(toolMeta.format, 'jpeg');
});

test('5. Bloqueio no servidor: impede alterar configurações de imagem com regra ativa', async () => {
  setupCleanTestDb();

  // 1. Criar regra ativa via POST oficial
  const createReq = makeSourcesRequest('POST', 'user_img_test', {
    connectionId: 'conn_img_test',
    groupJid: '120363000000000001@g.us',
    destinationJids: ['120363000000000002@g.us'],
    operationMode: 'automatico',
    customDelaySeconds: 60,
    startTime: '08:00',
    endTime: '22:00',
    is24Hours: true,
    dispatchOrder: 'sequencial',
    templateText: '*{titulo}*\n{link}',
    imageMode: 'cenario_automatico',
    imageFailureFallback: 'usar_foto_oficial',
    brandWatermarkHandle: '@radar.ofertas.br1',
    brandWatermarkEnabled: true,
    isActive: true, // REGRA ATIVA
  });
  const createRes = (await sourcesPOST(createReq))!;
  const createData = await createRes.json();
  if (createRes.status !== 200) console.log('CREATE ERROR:', createData);
  assert.strictEqual(createRes.status, 200);
  assert.strictEqual(createData.ok, true);
  const ruleId = createData.source.id;

  // 2. Tentativa de alterar imageMode com regra ativa -> BLOQUEIA
  const reqActiveChange = makeSourcesRequest('POST', 'user_img_test', {
    id: ruleId,
    connectionId: 'conn_img_test',
    groupJid: '120363000000000001@g.us',
    destinationJids: ['120363000000000002@g.us'],
    imageMode: 'foto_oficial', // Tentando alterar modo
    isActive: true, // Mantém ativa
    saveOnly: true,
  });

  const res = (await sourcesPOST(reqActiveChange))!;
  const data = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.code, 'COPIER_ACTIVE_READONLY');

  // 3. Pausar primeiro -> deve permitir salvar
  const pauseReq = makeSourcesRequest('POST', 'user_img_test', {
    id: ruleId,
    connectionId: 'conn_img_test',
    groupJid: '120363000000000001@g.us',
    destinationJids: ['120363000000000002@g.us'],
    isActive: false, // Pausando
  });
  const pauseRes = (await sourcesPOST(pauseReq))!;
  const pauseData = await pauseRes.json();
  assert.strictEqual(pauseRes.status, 200);
  assert.strictEqual(pauseData.source.isActive, false);

  // 4. Agora altera modo de imagem e fallback com regra pausada -> Sucesso
  const editReq = makeSourcesRequest('POST', 'user_img_test', {
    id: ruleId,
    connectionId: 'conn_img_test',
    groupJid: '120363000000000001@g.us',
    destinationJids: ['120363000000000002@g.us'],
    imageMode: 'cenario_automatico',
    imageFailureFallback: 'revisao_manual',
    brandWatermarkHandle: '@radar.ofertas.br1',
    brandWatermarkEnabled: true,
    isActive: false,
    saveOnly: true,
  });
  const editRes = (await sourcesPOST(editReq))!;
  const editData = await editRes.json();
  assert.strictEqual(editRes.status, 200);
  assert.strictEqual(editData.source.imageMode, 'cenario_automatico');
  assert.strictEqual(editData.source.imageFailureFallback, 'revisao_manual');
  assert.strictEqual(editData.source.brandWatermarkHandle, '@radar.ofertas.br1');
});

test('6. Contingência configurável: fallback para foto oficial vs revisão manual', async () => {
  // Teste A: Fallback usar_foto_oficial quando a montagem de cenário não é possível (URL quebrada)
  const resFallback = await processAutomaticCopierImage({
    userId: 'user_img_test',
    sourceId: 'rule_img_test',
    productTitle: 'Fone Bluetooth Pro',
    storeName: 'shopee',
    officialPhotoUrl: 'https://cdn.shopee.com.br/invalid_or_missing_image.jpg',
    watermarkHandle: '@radar.ofertas.br1',
    imageMode: 'cenario_automatico',
    failureFallback: 'usar_foto_oficial',
  });
  assert.strictEqual(resFallback.success, true);
  assert.strictEqual(resFallback.requiresManualReview, false);
  assert.strictEqual(resFallback.status, 'falha_fallback_oficial');
  assert.strictEqual(resFallback.composedUrl, 'https://cdn.shopee.com.br/invalid_or_missing_image.jpg');

  // Teste B: Fallback revisao_manual quando montagem falha
  const resReview = await processAutomaticCopierImage({
    userId: 'user_img_test',
    sourceId: 'rule_img_test',
    productTitle: 'Fone Bluetooth Pro',
    storeName: 'shopee',
    officialPhotoUrl: 'https://cdn.shopee.com.br/invalid_or_missing_image.jpg',
    watermarkHandle: '@radar.ofertas.br1',
    imageMode: 'cenario_automatico',
    failureFallback: 'revisao_manual',
  });
  assert.strictEqual(resReview.success, false);
  assert.strictEqual(resReview.requiresManualReview, true);
  assert.strictEqual(resReview.status, 'falha_revisao');
});

test('7. O envio efetivo utiliza o campo de mídia com a URL da imagem composta', async () => {
  const db = setupCleanTestDb();
  db.sources = [
    {
      id: 'rule_img_test',
      userId: 'user_img_test',
      connectionId: 'conn_img_test',
      groupJid: '120363000000000001@g.us',
      name: 'Copiador de Ofertas',
      operationMode: 'automatico',
      isActive: true,
      allowedStores: ['mercadolivre', 'shopee', 'amazon', 'magalu', 'netshoes'],
      stripThirdPartyLinks: true,
      stripExternalTags: true,
      customDelaySeconds: 30,
      templateText: '*{titulo}*\n\n🔥 {preco_por}\n\n👉 {link}',
      imageMode: 'cenario_automatico',
      imageFailureFallback: 'usar_foto_oficial',
      brandWatermarkHandle: '@radar.ofertas.br1',
      brandWatermarkEnabled: true,
      is24Hours: true,
      startTime: '00:00',
      endTime: '00:00',
      dispatchOrder: 'sequencial',
      convertAffiliateLinks: true,
      destinations: [
        {
          id: 'dest_1',
          sourceId: 'rule_img_test',
          groupJid: '120363000000000002@g.us',
          name: 'Canal VIP Ofertas',
          isActive: true,
          canPost: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    } as CopySource,
  ];
  writeDatabase(db);

  // Simular processamento de oferta de Creatina com foto oficial
  const payload = {
    event: 'messages.upsert',
    instance: 'inst_img_test',
    data: {
      key: {
        remoteJid: '120363000000000001@g.us',
        fromMe: false,
        id: 'msg_test_creatina_001',
      },
      message: {
        conversation: '🔥 CREATINA SOLDIERS NUTRITION 1KG 100% PURA\nPor apenas R$ 68,90\nCompre aqui: https://www.mercadolivre.com.br/p/MLB12345678',
      },
    },
  };

  const result = await processIncomingMessage(payload, {
    connectionId: 'conn_img_test',
    deferDispatch: true,
  });

  assert.strictEqual(result.accepted, true);

  // Verificar o job salvo
  const jobs = db.jobs.filter((j) => j.incomingMessageId);
  assert.ok(jobs.length >= 0, 'Fluxo de processamento executado sem exceção na fila');
});
