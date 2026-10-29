import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  readDatabase,
  writeDatabase,
  getActiveEvolutionConfig,
  diagnoseEvolutionError,
} from '@/lib/server/storage';
import { requireAdminAuth } from '@/lib/server/auth';

/**
 * Valida se a URL fornecida pertence ao host atual da aplicação e aponta para a rota correta do webhook
 */
function isAuthorizedProjectUrl(targetUrlStr: string, req: NextRequest): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(targetUrlStr);

    // Deve ser protocolo http ou https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'O protocolo da URL do webhook deve ser http ou https.' };
    }

    // Deve apontar estritamente para o endpoint do webhook deste projeto
    if (parsed.pathname !== '/api/webhook/evolution' && !parsed.pathname.endsWith('/api/webhook/evolution')) {
      return { valid: false, reason: 'O caminho do webhook deve apontar estritamente para /api/webhook/evolution.' };
    }

    // Obter hosts autorizados do próprio projeto
    const reqHost = req.headers.get('host') || req.nextUrl.host;
    const allowedHosts = new Set<string>();
    if (reqHost) allowedHosts.add(reqHost.toLowerCase());

    const envAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.PUBLIC_URL;
    if (envAppUrl) {
      try {
        const parsedEnv = new URL(envAppUrl);
        allowedHosts.add(parsedEnv.host.toLowerCase());
      } catch {
        // Ignora formatação inválida de env
      }
    }

    // Permitir se o host for um dos hosts autorizados do próprio projeto ou localhost ou provedor conhecido
    const targetHost = parsed.host.toLowerCase();
    const isHostAllowed =
      allowedHosts.has(targetHost) ||
      targetHost === 'localhost' ||
      targetHost === 'localhost:3000' ||
      targetHost === '127.0.0.1' ||
      targetHost === '127.0.0.1:3000' ||
      targetHost.endsWith('.ngrok-free.app') ||
      targetHost.endsWith('.trycloudflare.com') ||
      targetHost.endsWith('.onrender.com') ||
      targetHost.endsWith('.vercel.app') ||
      targetHost.endsWith('.up.railway.app') ||
      parsed.protocol === 'https:'; // Qualquer domínio HTTPS válido que termine com o caminho do webhook

    if (!isHostAllowed) {
      return {
        valid: false,
        reason: `Host não autorizado (${targetHost}). A configuração do webhook deve ser uma URL HTTPS pública ou localhost com caminho /api/webhook/evolution.`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'URL do webhook malformatada.' };
  }
}

export async function GET(req: NextRequest) {
  try {
    // 1. Exigir sessão de administrador
    const auth = requireAdminAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const db = readDatabase();
    const config = getActiveEvolutionConfig(db.whatsapp);

    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const suggestedWebhookUrl = `${protocol}://${host}/api/webhook/evolution`;

    let sanitizedWebhookStatus: { enabled?: boolean; url?: string; events?: string[] } | null = null;
    let liveError: string | undefined = undefined;

    // Se houver config da Evolution, tenta consultar o webhook cadastrado
    if (config.baseUrl && config.apiKey && config.instanceName) {
      try {
        const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(
          `${cleanBaseUrl}/webhook/find/${encodeURIComponent(config.instanceName)}`,
          {
            headers: { apikey: config.apiKey },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (res.ok) {
          const rawStatus = await res.json().catch(() => null);
          const hookObj = (rawStatus && typeof rawStatus === 'object' && 'webhook' in rawStatus)
            ? (rawStatus as any).webhook
            : rawStatus;

          if (hookObj && typeof hookObj === 'object') {
            // SANITIZAÇÃO RIGOROSA: Nunca devolver apiKey, headers internos ou tokens ao navegador
            sanitizedWebhookStatus = {
              enabled: Boolean(hookObj.enabled),
              url: typeof hookObj.url === 'string' ? hookObj.url : undefined,
              events: Array.isArray(hookObj.events) ? hookObj.events : [],
            };
          }
        } else {
          const errText = await res.text().catch(() => '');
          const diag = diagnoseEvolutionError(res.status, errText, null, config.instanceName);
          liveError = diag.message;
        }
      } catch (fetchErr: unknown) {
        const diag = diagnoseEvolutionError(null, '', fetchErr, config.instanceName);
        liveError = diag.message;
      }
    }

    return NextResponse.json({
      ok: true,
      suggestedWebhookUrl,
      isSecretConfigured: Boolean(process.env.EVOLUTION_WEBHOOK_SECRET || db.whatsapp.webhookSecret),
      authMode: process.env.EVOLUTION_WEBHOOK_SECRET ? 'env_secret' : db.whatsapp.webhookSecret ? 'specific_secret' : 'unconfigured',
      instanceName: config.instanceName,
      lastWebhookReceivedAt: db.whatsapp.lastWebhookReceivedAt || null,
      lastRealWebhookAt: db.whatsapp.lastRealWebhookAt || null,
      webhookStatus: sanitizedWebhookStatus,
      liveError,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Exigir sessão de administrador
    const auth = requireAdminAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await req.json();
    const { webhookUrl, customSecret } = body;
    const db = readDatabase();
    const config = getActiveEvolutionConfig(db.whatsapp);

    // 2. Garantir ou atualizar segredo específico do webhook
    if (customSecret !== undefined && String(customSecret).trim()) {
      db.whatsapp.webhookSecret = String(customSecret).trim();
      db.whatsapp.updatedAt = new Date().toISOString();
      writeDatabase(db);
    } else if (!db.whatsapp.webhookSecret && !process.env.EVOLUTION_WEBHOOK_SECRET) {
      // Gera segredo criptográfico específico de 32 bytes hex para autenticação do webhook
      db.whatsapp.webhookSecret = crypto.randomBytes(24).toString('hex');
      db.whatsapp.updatedAt = new Date().toISOString();
      writeDatabase(db);
    }

    const effectiveWebhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET || db.whatsapp.webhookSecret;

    if (!config.baseUrl || !config.apiKey || !config.instanceName) {
      return NextResponse.json(
        { ok: false, error: 'Evolution API não configurada em Ajustes (Base URL, Instância ou API Key ausentes).' },
        { status: 400 }
      );
    }

    // 3. Validação e restrição estrita da URL do webhook ao próprio projeto
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const defaultUrl = `${protocol}://${host}/api/webhook/evolution`;
    const targetUrl = webhookUrl ? String(webhookUrl).trim() : defaultUrl;

    const urlValidation = isAuthorizedProjectUrl(targetUrl, req);
    if (!urlValidation.valid) {
      return NextResponse.json(
        {
          ok: false,
          error: urlValidation.reason || 'URL de webhook não autorizada para este projeto.',
        },
        { status: 400 }
      );
    }

    const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');

    // 4. Configurar Webhook na Evolution API (compatível com Evolution v2 e v1) com cabeçalho específico x-webhook-secret
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const payload = {
      webhook: {
        enabled: true,
        url: targetUrl,
        byEvents: false,
        webhookByEvents: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
        ],
        headers: {
          'x-webhook-secret': effectiveWebhookSecret,
        },
      },
      // Campos de fallback na raiz para versões antigas da Evolution
      enabled: true,
      url: targetUrl,
      webhookByEvents: false,
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
      ],
      headers: {
        'x-webhook-secret': effectiveWebhookSecret,
      },
    };

    const res = await fetch(
      `${cleanBaseUrl}/webhook/set/${encodeURIComponent(config.instanceName)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const diag = diagnoseEvolutionError(res.status, errText, null, config.instanceName);
      return NextResponse.json(
        {
          ok: false,
          error: diag.message,
          categoryTitle: diag.categoryTitle,
        },
        { status: diag.statusCode }
      );
    }

    // Persistir URL de webhook configurada no banco
    db.whatsapp.webhookUrl = targetUrl;
    db.whatsapp.updatedAt = new Date().toISOString();
    writeDatabase(db);

    const isLocalhost = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
    const isGatewayRemote = config.baseUrl.includes('onrender.com') || (config.baseUrl.startsWith('https://') && !config.baseUrl.includes('localhost'));
    const warning = (isLocalhost && isGatewayRemote)
      ? 'Aviso importante: Seu webhook foi registrado com uma URL local (localhost), mas a Evolution API está hospedada na nuvem (Render). O Render não consegue enviar eventos HTTP para seu computador local. Para capturar mensagens reais em tempo real, use a URL pública HTTPS da sua aplicação (ex: Render, Vercel ou túnel Cloudflare/ngrok).'
      : undefined;

    // SANITIZAÇÃO RIGOROSA: Não devolver dados sensíveis da Evolution ao navegador
    return NextResponse.json({
      ok: true,
      message: 'Webhook configurado com sucesso na Evolution API com autenticação específica.',
      targetUrl,
      configured: true,
      warning,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const db = readDatabase();
    const config = getActiveEvolutionConfig(db.whatsapp);
    const diag = diagnoseEvolutionError(null, '', err, config.instanceName);

    return NextResponse.json(
      {
        ok: false,
        error: diag.message,
        categoryTitle: diag.categoryTitle,
      },
      { status: diag.statusCode }
    );
  }
}
