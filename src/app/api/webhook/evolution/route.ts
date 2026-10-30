import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { processIncomingMessage } from '@/lib/server/copier-service';
import { readDatabase, writeDatabase, getActiveEvolutionConfig } from '@/lib/server/storage';
import { isTestIsolationActive } from '@/lib/supabase';

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
    // AUTENTICAÇÃO ESPECÍFICA: Não usar a chave geral da Evolution como fallback sem necessidade comprovada
    const expectedSecret =
      process.env.EVOLUTION_WEBHOOK_SECRET ||
      process.env.WEBHOOK_SECRET ||
      db.whatsapp.webhookSecret;

    // 1. REJEIÇÃO: Recusar chamadas se nenhum segredo específico foi configurado no servidor
    if (!expectedSecret || expectedSecret.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Webhook não configurado: segredo específico ausente no servidor. Defina EVOLUTION_WEBHOOK_SECRET ou configure o webhook nas preferências do Copiador.',
        },
        { status: 503 }
      );
    }

    // 2. SEGURANÇA: Não aceitar segredo de webhook na URL
    if (req.nextUrl.searchParams.has('secret') || req.nextUrl.searchParams.has('apikey') || req.nextUrl.searchParams.has('token')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Segurança: Segredos na URL não são permitidos. Envie a autenticação via cabeçalho HTTP (x-webhook-secret ou apikey).',
        },
        { status: 400 }
      );
    }

    // 3. Validação estrita do cabeçalho de autenticação específico do webhook
    const authHeader = (
      req.headers.get('x-webhook-secret') ||
      req.headers.get('apikey') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      ''
    ).trim();

    const isAuthorized = authHeader === expectedSecret.trim();

    if (!isAuthorized) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Não autorizado: token do webhook da Evolution inválido ou ausente no cabeçalho x-webhook-secret.',
        },
        { status: 401 }
      );
    }

    const payload = await req.json();

    // Atualiza data do último evento real do webhook recebido com sucesso
    const nowIso = new Date().toISOString();
    db.whatsapp.lastRealWebhookAt = nowIso;
    db.whatsapp.lastWebhookReceivedAt = nowIso;
    writeDatabase(db);

    // 4. Validar se o webhook pertence à instância configurada
    const incomingInstance = (
      typeof payload.instance === 'string'
        ? payload.instance
        : payload.instance?.instanceName || payload.instanceName || payload.data?.instanceName || ''
    ).trim();

    if (incomingInstance && config.instanceName) {
      if (incomingInstance.toLowerCase() !== config.instanceName.toLowerCase().trim()) {
        return NextResponse.json(
          {
            ok: false,
            error: `Instância recebida (${incomingInstance}) diverge da configurada (${config.instanceName}).`,
          },
          { status: 403 }
        );
      }
    }

    // 5. Se for evento que não contém dados de mensagem (ex: connection.update), registrar e responder 200
    const eventName = String(payload.event || '').toLowerCase();
    if (eventName && !eventName.includes('message') && !payload.data?.key && !payload.key) {
      return NextResponse.json(
        {
          ok: true,
          event: payload.event,
          message: 'Evento de sistema da Evolution recebido e ignorado pelo copiador de mensagens.',
        },
        { status: 200 }
      );
    }

    const result = await processIncomingMessage(payload);

    if (!isTestIsolationActive()) {
      try {
        const logPath = path.join(process.cwd(), '.data', 'webhook_events.jsonl');
        const keyObj = payload?.data?.key || payload?.key || {};
        const logEntry = {
          receivedAt: nowIso,
          event: payload?.event || 'unknown',
          instance: incomingInstance || config.instanceName,
          remoteJid: keyObj.remoteJid || null,
          fromMe: Boolean(keyObj.fromMe),
          messageId: keyObj.id || result.messageId,
          accepted: result.accepted,
          status: result.status,
          reason: result.reason,
          jobIds: result.jobIds || [],
        };
        fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n', 'utf-8');
      } catch {
        // Ignora erro de log de auditoria
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erro no processamento do webhook Evolution:', message);
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
