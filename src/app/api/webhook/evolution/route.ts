import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { processIncomingMessage } from '@/lib/server/copier-service';
import { readDatabase, writeDatabase, getActiveEvolutionConfig } from '@/lib/server/storage';
import { isTestIsolationActive } from '@/lib/supabase';
import { runWorkerCycle } from '@/lib/server/worker-engine';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'Radar de Ofertas - Evolution Webhook Receiver',
    status: 'online',
  });
}

export async function POST(req: NextRequest) {
  try {
    const db = readDatabase();
    const config = getActiveEvolutionConfig(db.whatsapp);

    // 1. SEGURANÇA: Não aceitar segredo de webhook na URL
    if (req.nextUrl.searchParams.has('secret') || req.nextUrl.searchParams.has('apikey') || req.nextUrl.searchParams.has('token')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Segurança: Segredos na URL não são permitidos. Envie a autenticação via cabeçalho HTTP (x-webhook-secret ou apikey).',
        },
        { status: 400 }
      );
    }

    const payload = await req.json().catch(() => ({}));

    // Identificar a instância que enviou o webhook
    const incomingInstance = (
      typeof payload.instance === 'string'
        ? payload.instance
        : payload.instance?.instanceName || payload.instanceName || payload.data?.instanceName || ''
    ).trim();

    // Localizar conexão correspondente a esta instância
    const matchedConnection = (db.connections || []).find(
      (c) => c.instanceName.toLowerCase().trim() === incomingInstance.toLowerCase().trim()
    );

    // Segredo esperado: da conexão específica ou das variáveis de ambiente / global
    const expectedSecret =
      matchedConnection?.webhookSecret ||
      process.env.EVOLUTION_WEBHOOK_SECRET ||
      process.env.WEBHOOK_SECRET ||
      db.whatsapp.webhookSecret;

    if (!expectedSecret || expectedSecret.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Webhook não configurado: segredo ausente no servidor.',
        },
        { status: 503 }
      );
    }

    // Validação estrita do cabeçalho de autenticação
    const authHeader = (
      req.headers.get('x-webhook-secret') ||
      req.headers.get('apikey') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      ''
    ).trim();

    const isAuthorized = authHeader === expectedSecret.trim() || authHeader === (matchedConnection?.apiKey || config.apiKey);

    if (!isAuthorized) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Não autorizado: token do webhook da Evolution inválido ou ausente.',
        },
        { status: 401 }
      );
    }

    // Atualiza data do último evento real do webhook recebido com sucesso
    const nowIso = new Date().toISOString();
    db.whatsapp.lastRealWebhookAt = nowIso;
    db.whatsapp.lastWebhookReceivedAt = nowIso;
    if (matchedConnection) {
      matchedConnection.lastRealWebhookAt = nowIso;
      matchedConnection.lastPingAt = nowIso;
    }
    writeDatabase(db);

    // Se for evento que não contém dados de mensagem (ex: CONNECTION_UPDATE), registrar e responder 200
    const eventName = String(payload.event || '').toLowerCase();
    if (eventName && !eventName.includes('message') && !payload.data?.key && !payload.key) {
      if (eventName.includes('connection') && payload.data?.state) {
        const newState = String(payload.data.state).toLowerCase();
        if (matchedConnection) {
          if (newState === 'open' || newState === 'connected') matchedConnection.status = 'connected';
          else if (newState === 'connecting') matchedConnection.status = 'connecting';
          else if (newState === 'close' || newState === 'disconnected') matchedConnection.status = 'disconnected';
          writeDatabase(db);
        }
      }

      return NextResponse.json(
        {
          ok: true,
          event: payload.event,
          message: 'Evento de sistema da Evolution processado.',
        },
        { status: 200 }
      );
    }

    // Processar a mensagem de entrada vinculada à conexão correta
    const result = await processIncomingMessage(payload, {
      connectionId: matchedConnection?.id,
    });

    if (!isTestIsolationActive()) {
      try {
        const logPath = path.join(process.cwd(), '.data', 'webhook_events.jsonl');
        const keyObj = payload?.data?.key || payload?.key || {};
        const logEntry = {
          receivedAt: nowIso,
          event: payload?.event || 'unknown',
          instance: incomingInstance || config.instanceName,
          connectionId: matchedConnection?.id,
          remoteJid: keyObj.remoteJid || null,
          fromMe: Boolean(keyObj.fromMe),
          messageId: keyObj.id || result.messageId,
          accepted: result.accepted,
          status: result.status,
          reason: result.reason,
          jobIds: result.jobIds || [],
        };
        fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n', 'utf-8');
      } catch {}
    }

    // Se novos trabalhos de envio foram gerados imediatamente, dispara o ciclo do worker de forma assíncrona
    if (result.accepted && result.jobIds && result.jobIds.length > 0) {
      // Disparo em background não bloqueia a resposta 200 ao gateway Evolution
      setTimeout(() => {
        runWorkerCycle().catch(() => {});
      }, 500);
    }

    return NextResponse.json(
      {
        ok: true,
        messageId: result.messageId,
        status: result.status,
        accepted: result.accepted,
        reason: result.reason,
        jobIds: result.jobIds,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno no processamento do webhook.' },
      { status: 500 }
    );
  }
}
