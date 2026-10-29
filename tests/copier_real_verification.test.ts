import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { NextRequest } from 'next/server';
import { readDatabase, writeDatabase, getInitialDatabase } from '../src/lib/server/storage';
import { POST as postWebhook } from '../src/app/api/webhook/evolution/route';
import { GET as getCopierStatus } from '../src/app/api/copier/status/route';
import { GET as getCopierSources, POST as postCopierSources } from '../src/app/api/copier/sources/route';
import { GET as getCopierMessages } from '../src/app/api/copier/messages/route';
import { GET as getCopierJobs } from '../src/app/api/copier/jobs/route';
import { GET as getWhatsAppGroups } from '../src/app/api/whatsapp/groups/route';

// -----------------------------------------------------------------------------
// ISOLAMENTO TOTAL: Banco temporário efêmero em os.tmpdir()
// O arquivo real .data/radar_db.json NUNCA é lido nem modificado nos testes
// -----------------------------------------------------------------------------
const tempDbPath = path.join(
  os.tmpdir(),
  `radar_copier_verify_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
);
process.env.RADAR_DB_PATH = tempDbPath;

const initialSeed = getInitialDatabase();
initialSeed.whatsapp.instanceName = 'radar_ofertas';
initialSeed.whatsapp.status = 'connected';
initialSeed.whatsapp.lastVerificationStatus = 'verified';
initialSeed.whatsapp.phoneNumber = '5519993812187';
initialSeed.whatsapp.ownerJid = '5519993812187@s.whatsapp.net';
initialSeed.whatsapp.groupsOwnerJid = '5519993812187@s.whatsapp.net';
initialSeed.whatsapp.webhookSecret = 'whsec_d47a3e9c68f12a0b81e4c935b67e52a1';
initialSeed.groups = [
  {
    id: '00000000-0000-0000-0000-000000000101',
    userId: initialSeed.settings.userId,
    groupJid: '120363423890925139@g.us',
    name: 'Gaby Garimpou #11',
    participantCount: 727,
    isAdmin: false,
    canPost: false,
    permissionStatus: 'restricted_readonly',
    isOrigin: true,
    isDestination: false,
    isTestGroup: false,
    lastSyncedAt: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    userId: initialSeed.settings.userId,
    groupJid: '120363412589119281@g.us',
    name: 'Radar de Ofertas #1',
    participantCount: 8,
    isAdmin: true,
    canPost: true,
    permissionStatus: 'verified_admin',
    isOrigin: false,
    isDestination: true,
    isTestGroup: false,
    lastSyncedAt: new Date().toISOString(),
  },
];
const shopeeStore = initialSeed.stores.find((s) => s.storeName === 'shopee');
if (shopeeStore) {
  shopeeStore.affiliateTag = 'radar_oficial_sp';
  shopeeStore.isActive = true;
  shopeeStore.isValidated = true;
}
writeDatabase(initialSeed);

test.after(() => {
  try {
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  } catch {}
  delete process.env.RADAR_DB_PATH;
});

const WEBHOOK_SECRET = 'whsec_d47a3e9c68f12a0b81e4c935b67e52a1';

test('1. A conta conectada e a lista de grupos vêm da Evolution sem dados fictícios', async () => {
  const req = new NextRequest('http://localhost:3000/api/whatsapp/groups');
  const res = await getWhatsAppGroups(req);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.groups));
  assert.ok(data.groups.length > 0, 'Deve conter os grupos sincronizados da conta');

  // Verificar que não há grupos fictícios mockados (ex: 5555555555)
  for (const g of data.groups) {
    assert.ok(!g.groupJid.includes('55555555'), `JID não deve ser fictício: ${g.groupJid}`);
    assert.ok(g.groupJid.endsWith('@g.us'), `JID de grupo real deve terminar com @g.us: ${g.groupJid}`);
  }

  // Verificar se o grupo Radar de Ofertas #1 é admin comprovado
  const adminGroup = data.groups.find((g: any) => g.groupJid === '120363412589119281@g.us');
  assert.ok(adminGroup, 'Deve conter o grupo Radar de Ofertas #1');
  assert.equal(adminGroup.canPost, true);
  assert.equal(adminGroup.permissionStatus, 'verified_admin');
});

test('2. A origem e o destino escolhidos persistem após salvar e recarregar', async () => {
  const originJid = '120363423890925139@g.us'; // Gaby Garimpou #11
  const destJid = '120363412589119281@g.us'; // Radar de Ofertas #1

  const saveReq = new NextRequest('http://localhost:3000/api/copier/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupJid: originJid,
      name: 'Cópia Oficial Garimpo',
      operationMode: 'revisao_manual',
      allowedStores: ['shopee', 'mercadolivre', 'netshoes'],
      stripThirdPartyLinks: true,
      customDelaySeconds: 60,
      destinationJids: [destJid],
      isActive: true,
    }),
  });

  const saveRes = await postCopierSources(saveReq);
  assert.ok(saveRes);
  const saveData = await saveRes.json();
  assert.equal(saveRes.status, 200);
  assert.equal(saveData.ok, true);
  assert.equal(saveData.source.groupJid, originJid);
  assert.equal(saveData.source.isActive, true);
  assert.equal(saveData.destinations[0].groupJid, destJid);

  // Consulta posterior simulando refresh de página
  const getReq = new NextRequest('http://localhost:3000/api/copier/status');
  const getRes = await getCopierStatus(getReq);
  const getStatus = await getRes.json();

  assert.equal(getRes.status, 200);
  assert.equal(getStatus.ok, true);
  assert.ok(getStatus.summary, 'Status deve retornar summary permanente');
  assert.equal(getStatus.summary.originJid, originJid);
  assert.ok(getStatus.summary.destinationJids.includes(destJid));
  assert.equal(getStatus.summary.operationMode, 'revisao_manual');
  assert.equal(getStatus.summary.isActive, true);
});

test('3. Uma mensagem real de grupo autorizado entra em Últimas Mensagens e na Fila de Revisão', async () => {
  const originJid = '120363423890925139@g.us';
  const uniqueMsgId = `real_test_msg_${Date.now()}`;

  const webhookPayload = {
    event: 'messages.upsert',
    instance: 'radar_ofertas',
    data: {
      key: {
        remoteJid: originJid,
        fromMe: false,
        id: uniqueMsgId,
        participant: '5519988887777@s.whatsapp.net',
      },
      pushName: 'Membro Garimpador',
      message: {
        extendedTextMessage: {
          text: '🔥 Olha essa oferta imperdível do Shopee com 40% OFF https://shopee.com.br/product-exemplo-real-i.123.456 aproveitem!',
        },
      },
    },
  };

  const req = new NextRequest('http://localhost:3000/api/webhook/evolution', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': WEBHOOK_SECRET,
    },
    body: JSON.stringify(webhookPayload),
  });

  const res = await postWebhook(req);
  const result = await res.json();

  assert.equal(res.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'processada');

  // Checar se a mensagem aparece em "Últimas mensagens"
  const msgReq = new NextRequest('http://localhost:3000/api/copier/messages?realOnly=true');
  const msgRes = await getCopierMessages(msgReq);
  const msgData = await msgRes.json();

  assert.equal(msgRes.status, 200);
  const foundMsg = msgData.messages.find((m: any) => m.messageId === uniqueMsgId);
  assert.ok(foundMsg, 'Mensagem deve estar registrada em últimas mensagens');
  assert.equal(foundMsg.remoteJid, originJid);
  assert.equal(foundMsg.status, 'processada');
  assert.ok(foundMsg.affiliateUrl, 'Deve conter link de afiliado convertido');

  // Checar se entrou na Fila de Revisão Manual como aguardando_aprovacao
  const jobsReq = new NextRequest('http://localhost:3000/api/copier/jobs?status=aguardando_aprovacao');
  const jobsRes = await getCopierJobs(jobsReq);
  const jobsData = await jobsRes.json();

  const foundJob = jobsData.jobs.find((j: any) => j.incomingMessageId === foundMsg.id);
  assert.ok(foundJob, 'Deve criar job na fila de revisão manual');
  assert.equal(foundJob.status, 'aguardando_aprovacao', 'Deve estar aguardando aprovação');
  assert.equal(foundJob.targetJid, '120363412589119281@g.us', 'Destino deve ser o grupo autorizado');
});

test('4. Uma mensagem de outro grupo NÃO autorizado é descartada e não entra na fila', async () => {
  const unauthorizedGroup = '120363999999999999@g.us';
  const unauthMsgId = `unauth_msg_${Date.now()}`;

  const webhookPayload = {
    event: 'messages.upsert',
    instance: 'radar_ofertas',
    data: {
      key: {
        remoteJid: unauthorizedGroup,
        fromMe: false,
        id: unauthMsgId,
        participant: '5511999999999@s.whatsapp.net',
      },
      message: {
        extendedTextMessage: {
          text: 'Promoção externa https://shopee.com.br/produto-qualquer',
        },
      },
    },
  };

  const req = new NextRequest('http://localhost:3000/api/webhook/evolution', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': WEBHOOK_SECRET,
    },
    body: JSON.stringify(webhookPayload),
  });

  const res = await postWebhook(req);
  const result = await res.json();

  assert.equal(res.status, 200);
  assert.equal(result.data.accepted, false);
  assert.equal(result.data.status, 'descartada');
  assert.ok(result.data.reason.includes('não cadastrado'));

  // Verificar que NÃO criou nenhum job
  const jobsReq = new NextRequest('http://localhost:3000/api/copier/jobs');
  const jobsRes = await getCopierJobs(jobsReq);
  const jobsData = await jobsRes.json();

  const foundJob = jobsData.jobs.find((j: any) => j.targetJid === unauthorizedGroup);
  assert.equal(foundJob, undefined, 'Nenhum job deve ser criado para grupo não cadastrado');
});

test('5. Idempotência (deduplicação) e bloqueio estrito em caso de falha de conversão', async () => {
  const originJid = '120363423890925139@g.us';
  const duplicateMsgId = `dup_test_${Date.now()}`;

  const firstPayload = {
    event: 'messages.upsert',
    instance: 'radar_ofertas',
    data: {
      key: {
        remoteJid: originJid,
        fromMe: false,
        id: duplicateMsgId,
        participant: '5519988887777@s.whatsapp.net',
      },
      message: {
        conversation: 'Achado legal no Shopee https://shopee.com.br/product-teste-dup.123.456',
      },
    },
  };

  const req1 = new NextRequest('http://localhost:3000/api/webhook/evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
    body: JSON.stringify(firstPayload),
  });
  const res1 = await postWebhook(req1);
  const data1 = await res1.json();
  assert.equal(data1.ok, true);

  // Segunda entrega da MESMA mensagem (reentrega de webhook da Evolution)
  const req2 = new NextRequest('http://localhost:3000/api/webhook/evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
    body: JSON.stringify(firstPayload),
  });
  const res2 = await postWebhook(req2);
  const data2 = await res2.json();

  assert.equal(data2.data.accepted, false);
  assert.equal(data2.data.status, 'descartada');
  assert.ok(data2.data.reason.includes('duplicada'));

  // B. Falha de conversão: link sem suporte de afiliado NÃO pode ser enviado nem publicado
  const unconvertibleMsgId = `unconvertible_${Date.now()}`;
  const unconvertiblePayload = {
    event: 'messages.upsert',
    instance: 'radar_ofertas',
    data: {
      key: {
        remoteJid: originJid,
        fromMe: false,
        id: unconvertibleMsgId,
        participant: '5519988887777@s.whatsapp.net',
      },
      message: {
        conversation: 'Oferta em loja desconhecida sem afiliação https://loja-estranha-sem-afiliado.com/produto-123',
      },
    },
  };

  const req3 = new NextRequest('http://localhost:3000/api/webhook/evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
    body: JSON.stringify(unconvertiblePayload),
  });
  const res3 = await postWebhook(req3);
  const data3 = await res3.json();

  assert.equal(data3.data.status, 'descartada');
  assert.ok(data3.data.reason.includes('Falha na conversão de link próprio'));

  // Confirmar que NENHUM job foi agendado para o link falho
  const jobsReq = new NextRequest('http://localhost:3000/api/copier/jobs');
  const jobsRes = await getCopierJobs(jobsReq);
  const jobsData = await jobsRes.json();

  const badJob = jobsData.jobs.find((j: any) => j.messageText.includes('loja-estranha-sem-afiliado'));
  assert.equal(badJob, undefined, 'NUNCA publicar com link de terceiros ou falha de conversão');
});

test('6. A rota de status mostra claramente o estado do Copiador e os grupos monitorados', async () => {
  const req = new NextRequest('http://localhost:3000/api/copier/status');
  const res = await getCopierStatus(req);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.ok(data.summary);
  assert.equal(typeof data.summary.isActive, 'boolean');
  assert.ok(data.summary.originName, 'Deve exibir o nome do grupo monitorado');
  assert.ok(Array.isArray(data.summary.destinationNames), 'Deve exibir lista de destinos');
  assert.ok(['ativo', 'pausado', 'aguardando_mensagens', 'erro'].includes(data.summary.state));
});

