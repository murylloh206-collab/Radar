import { connectionView, verifyWhatsAppConnection, refreshWhatsAppIdentity, hasFreshConnectionObservation } from '@/lib/server/whatsapp-state';
import { copierConnections } from '@/lib/server/copier-group-catalog';
import { performance } from 'node:perf_hooks';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkApiAuth } from '@/lib/server/auth';
import {
  readDatabase,
  ensureValidUuid,
  getWhatsAppConnectionAsync,
  saveWhatsAppConnection,
  deleteWhatsAppConnection,
  setDefaultWhatsAppConnection,
  getActiveEvolutionConfig,
} from '@/lib/server/storage';
import { WhatsAppConnection } from '@/lib/types';

// Timeout padrão para chamadas ao gateway remoto
const GATEWAY_TIMEOUT_MS = 8000;

interface EvolutionStateResult {
  exists: boolean;
  state: string;
  status: number;
  error?: string;
}

/**
 * Consulta o estado da instância na Evolution API de forma segura
 */
async function checkEvolutionState(
  baseUrl: string,
  apiKey: string,
  instanceName: string
): Promise<EvolutionStateResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      return { exists: false, state: 'not_found', status: 404 };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        exists: false,
        state: 'error',
        status: res.status,
        error: `Gateway retornou erro HTTP ${res.status}: ${errText.slice(0, 120)}`,
      };
    }

    const data = await res.json().catch(() => ({}));
    const rawState = String(data?.instance?.state || data?.state || '').toLowerCase().trim();
    return {
      exists: true,
      state: rawState || 'disconnected',
      status: 200,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    const isTimeout = err?.name === 'AbortError';
    return {
      exists: false,
      state: 'error',
      status: isTimeout ? 504 : 502,
      error: isTimeout ? 'Timeout ao consultar gateway WhatsApp.' : `Falha de rede: ${err?.message || err}`,
    };
  }
}

/**
 * Solicita QR Code da instância no gateway Evolution
 */
async function fetchEvolutionQr(
  baseUrl: string,
  apiKey: string,
  instanceName: string
): Promise<{ qrBase64?: string; qrCodeRaw?: string; error?: string; status?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      return { status: 404, error: 'Instância não encontrada no gateway.' };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { status: res.status, error: `Falha ao solicitar QR code (HTTP ${res.status}): ${errText.slice(0, 120)}` };
    }

    const data = await res.json().catch(() => ({}));
    const qrBase64 = data?.base64 || data?.qrcode?.base64 || undefined;
    const qrCodeRaw = data?.code || data?.qrcode?.code || undefined;

    return { qrBase64, qrCodeRaw, status: 200 };
  } catch (err: any) {
    clearTimeout(timeout);
    return {
      status: err?.name === 'AbortError' ? 504 : 502,
      error: err?.name === 'AbortError' ? 'Timeout ao solicitar QR Code.' : `Erro de rede: ${err?.message || err}`,
    };
  }
}

/**
 * Cria ou repara uma instância exclusiva na Evolution API e configura Webhook
 */
async function createOrRepairEvolutionInstance(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  webhookUrl: string,
  webhookSecret: string
): Promise<{ ok: boolean; qrBase64?: string; qrCodeRaw?: string; error?: string; status?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

  let qrBase64: string | undefined;
  let qrCodeRaw: string | undefined;

  try {
    const createRes = await fetch(`${baseUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '');
      return {
        ok: false,
        status: createRes.status,
        error: `Falha ao criar instância na Evolution API (HTTP ${createRes.status}): ${errText.slice(0, 150)}`,
      };
    }

    const createData = await createRes.json().catch(() => ({}));
    qrBase64 =
      createData?.qrcode?.base64 ||
      createData?.base64 ||
      createData?.instance?.qrcode?.base64 ||
      undefined;
    qrCodeRaw =
      createData?.qrcode?.code ||
      createData?.code ||
      undefined;
  } catch (err: any) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: err?.name === 'AbortError' ? 504 : 502,
      error: err?.name === 'AbortError' ? 'Timeout ao criar instância no gateway.' : `Erro de rede: ${err?.message || err}`,
    };
  }

  // Se não veio QR code no retorno do create, solicita explicitamente em /instance/connect
  if (!qrBase64) {
    const qrFetch = await fetchEvolutionQr(baseUrl, apiKey, instanceName);
    qrBase64 = qrFetch.qrBase64;
    qrCodeRaw = qrFetch.qrCodeRaw;
  }

  // The persistent worker configures and verifies the webhook independently of pairing.
  return {
    ok: true,
    qrBase64,
    qrCodeRaw,
    status: 200,
  };
}

export async function GET(req: NextRequest) {
  const auth = checkApiAuth(req);
  if (!auth.authorized || !auth.session) return auth.response!;
  const started = performance.now();
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  try {
    let connections = await copierConnections(auth.session);
    const selectedId = req.nextUrl.searchParams.get('connectionId');
    if (selectedId && !connections.some(connection => connection.id === selectedId)) {
      return NextResponse.json({ ok: false, error: 'Conexão não encontrada nesta conta.' }, { status: 404, headers });
    }
    const chosen = selectedId || connections.find(connection => connection.isDefault)?.id || connections[0]?.id;
    if (req.nextUrl.searchParams.get('verify') === 'true') {
      connections = await Promise.all(connections.map(async connection => {
        if (connection.id !== chosen) return connection;
        return { ...connection, ...await verifyWhatsAppConnection(connection) };
      }));
    }
    if (req.nextUrl.searchParams.get('identity') === 'true') {
      connections = await Promise.all(connections.map(async connection => connection.id === chosen ?
        { ...connection, ...await refreshWhatsAppIdentity(connection) } : connection));
    }
    return NextResponse.json({ ok: true, connections: connections.map(connectionView), total: connections.length },
      { headers: { ...headers, 'Server-Timing': 'connections;dur=' + (performance.now() - started).toFixed(1) } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Não foi possível consultar as conexões persistidas.' }, { status: 503, headers });
  }
}

export async function POST(req: NextRequest) {
  const started = performance.now();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Server-Timing', 'whatsapp-operation;dur=' + (performance.now() - started).toFixed(1));
    headers.set('Cache-Control', 'private, no-store');
    return NextResponse.json(body, { ...init, headers });
  };
  const auth = checkApiAuth(req);
  if (!auth.authorized || !auth.session) {
    return auth.response!;
  }

  const userId = auth.session.userId;

  try {
    const body = await req.json();
    const action = body.action as
      | 'create'
      | 'poll_qr'
      | 'reconnect'
      | 'disconnect'
      | 'delete'
      | 'set_default'
      | 'update_label'
      | 'get_delete_impact';

    const defaultCfg = getActiveEvolutionConfig();
    let baseUrl = (body.baseUrl || defaultCfg.baseUrl || '').replace(/\/+$/, '');
    let apiKey = body.apiKey || defaultCfg.apiKey;

    // Se uma conexão específica foi informada, permite usar suas credenciais persistidas
    if (body.connectionId) {
      const existingConn = await getWhatsAppConnectionAsync(body.connectionId as string, userId);
      if (existingConn) {
        if (!baseUrl && existingConn.baseUrl) baseUrl = existingConn.baseUrl.replace(/\/+$/, '');
        if (!apiKey && existingConn.apiKey) apiKey = existingConn.apiKey;
      }
    }

    if (!baseUrl || !apiKey) {
      return timedJson(
        { ok: false, error: 'Evolution Gateway não configurado no servidor (baseUrl ou apiKey ausentes).' },
        { status: 500 }
      );
    }

    // 0. AÇÃO: CONSULTAR IMPACTO DE EXCLUSÃO (VÍNCULOS AFETADOS)
    if (action === 'get_delete_impact') {
      const connectionId = body.connectionId as string;
      const conn = await getWhatsAppConnectionAsync(connectionId, userId);

      if (!conn) {
        return timedJson(
          { ok: false, error: 'Conexão não encontrada ou não pertence a este usuário.' },
          { status: 404 }
        );
      }

      const db = readDatabase();
      const groupsCount = (db.groups || []).filter(
        (g) => g.connectionId === conn.id || (!g.connectionId && conn.isDefault)
      ).length;
      const sourcesCount = (db.sources || []).filter((s) => s.connectionId === conn.id).length;
      const jobsCount = (db.jobs || []).filter((j) => j.connectionId === conn.id).length;

      return timedJson({
        ok: true,
        impact: {
          connectionId: conn.id,
          label: conn.label,
          phoneNumber: conn.phoneNumber,
          isDefault: conn.isDefault,
          groupsCount,
          sourcesCount,
          jobsCount,
        },
      });
    }

    // 1. AÇÃO: CRIAR NOVA CONEXÃO E GERAR QR CODE
    if (action === 'create') {
      const label = String(body.label || '').trim() || 'Meu WhatsApp';
      const userShort = userId.replace(/-/g, '').slice(0, 8);
      const randomSuffix = crypto.randomBytes(3).toString('hex');
      const instanceName = `radar_${userShort}_${randomSuffix}`;
      const connectionId = ensureValidUuid();
      const webhookSecret = crypto.randomUUID();

      const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').trim();
      const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
      const webhookUrl = `${proto}://${host}/api/webhook/evolution`;

      const createRes = await createOrRepairEvolutionInstance(baseUrl, apiKey, instanceName, webhookUrl, webhookSecret);

      if (!createRes.ok) {
        return timedJson(
          { ok: false, error: createRes.error || 'Falha ao criar instância no gateway WhatsApp.' },
          { status: createRes.status || 502 }
        );
      }

      const newConnection: WhatsAppConnection = {
        id: connectionId,
        userId,
        label,
        instanceName,
        baseUrl,
        apiKey,
        status: createRes.qrBase64 ? 'qrcode' : 'connecting',
        qrCodeBase64: createRes.qrBase64,
        webhookUrl,
        webhookSecret,
        isDefault: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveWhatsAppConnection(newConnection);

      return timedJson({
        ok: true,
        connectionId,
        instanceName,
        label,
        status: newConnection.status,
        qrCodeBase64: createRes.qrBase64,
        qrcode: createRes.qrBase64 ? { base64: createRes.qrBase64, code: createRes.qrCodeRaw } : undefined,
        connection: safeConnection(newConnection),
      });
    }

    // 2. AÇÃO: VERIFICAR STATUS DO QR CODE / POLLING DE PAREAMENTO
    if (action === 'poll_qr') {
      const conn = await getWhatsAppConnectionAsync(String(body.connectionId || ''), userId);
      if (!conn) return timedJson({ ok: false, error: 'Conexão não encontrada.' }, { status: 404 });
      const verified = await verifyWhatsAppConnection(conn);
      const connected = verified.status === 'connected' && verified.lastVerificationStatus === 'verified';
      if (connected) return timedJson({ ok: true, connected: true, status: 'connected',
        identityPending: !verified.ownerJid, connection: safeConnection(verified) });
      if (body.refreshQr === true && verified.lastVerificationStatus !== 'unreachable') {
        const qr = await fetchEvolutionQr(baseUrl, apiKey, conn.instanceName);
        if (qr.qrBase64) return timedJson({ ok: true, connected: false, status: 'qrcode',
          qrCodeBase64: qr.qrBase64, qrcode: { base64: qr.qrBase64, code: qr.qrCodeRaw } });
      }
      return timedJson({ ok: true, connected: false, status: verified.status,
        checking: verified.lastVerificationStatus === 'unreachable', connection: safeConnection(verified) });
    }

    // 3. AÇÃO: RECONECTAR INSTÂNCIA EXISTENTE (OU REPARAR INSTÂNCIA REMOVIDA)
    if (action === 'reconnect') {
      const connectionId = body.connectionId as string;
      const conn = await getWhatsAppConnectionAsync(connectionId, userId);

      if (!conn) {
        return timedJson(
          { ok: false, error: 'Conexão não encontrada ou não pertence a este usuário.' },
          { status: 404 }
        );
      }

      if (hasFreshConnectionObservation(conn)) {
        return timedJson({ ok: true, connected: true, alreadyConnected: true, status: 'connected', connection: connectionView(conn) });
      }
      if (!conn.webhookSecret) conn.webhookSecret = crypto.randomUUID();
      // 1. Consultar estado da instância correspondente no gateway Evolution
      const instanceCheck = await checkEvolutionState(baseUrl, apiKey, conn.instanceName);

      // CASO A: Instância já está conectada no gateway
      if (instanceCheck.exists && (instanceCheck.state === 'open' || instanceCheck.state === 'connected')) {
        conn.status = 'connected';
        conn.lastVerificationStatus = 'verified';
        conn.qrCodeBase64 = undefined;
        conn.lastPingAt = new Date().toISOString();
        await saveWhatsAppConnection(conn);

        return timedJson({
          ok: true,
          alreadyConnected: true,
          status: 'connected',
          connected: true,
          message: `A conta "${conn.label}" já está conectada no WhatsApp.`,
          connection: safeConnection(conn),
          phoneNumber: conn.phoneNumber,
          profileName: conn.profileName,
          profilePicUrl: conn.profilePicUrl,
        });
      }

      // CASO B: Instância existe no gateway e está desconectada -> solicita novo QR code real
      if (instanceCheck.exists) {
        const qrRes = await fetchEvolutionQr(baseUrl, apiKey, conn.instanceName);
        if (qrRes.qrBase64) {
          conn.status = 'qrcode';
          conn.qrCodeBase64 = qrRes.qrBase64;
          await saveWhatsAppConnection(conn);

          return timedJson({
            ok: true,
            status: 'qrcode',
            connectionId: conn.id,
            qrCodeBase64: qrRes.qrBase64,
            qrcode: { base64: qrRes.qrBase64, code: qrRes.qrCodeRaw },
            connection: safeConnection(conn),
          });
        }
      }

      // CASO C: Instância NÃO existe no gateway (404 Not Found) -> REPARAR CONEXÃO
      // Cria instância exclusiva e atualiza o vínculo persistido
      if (!instanceCheck.exists && instanceCheck.status === 404) {
        const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').trim();
        const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
        const webhookUrl = `${proto}://${host}/api/webhook/evolution`;
        const webhookSecret = conn.webhookSecret || crypto.randomUUID();

        const repairResult = await createOrRepairEvolutionInstance(
          baseUrl,
          apiKey,
          conn.instanceName,
          webhookUrl,
          webhookSecret
        );

        if (repairResult.ok && repairResult.qrBase64) {
          conn.status = 'qrcode';
          conn.qrCodeBase64 = repairResult.qrBase64;
          conn.webhookUrl = webhookUrl;
          conn.webhookSecret = webhookSecret;
          await saveWhatsAppConnection(conn);

          return timedJson({
            ok: true,
            repaired: true,
            status: 'qrcode',
            message: 'Instância remota reparada com sucesso. Escaneie o novo QR Code.',
            connectionId: conn.id,
            qrCodeBase64: repairResult.qrBase64,
            qrcode: { base64: repairResult.qrBase64, code: repairResult.qrCodeRaw },
            connection: safeConnection(conn),
          });
        }

        return timedJson(
          {
            ok: false,
            error: repairResult.error || 'A instância não existia no gateway e não pôde ser recriada automaticamente.',
            reason: 'repair_failed',
          },
          { status: 502 }
        );
      }

      // CASO D: Falha do Gateway (timeout, 502, credencial inválida)
      return timedJson(
        {
          ok: false,
          error: instanceCheck.error || 'Não foi possível gerar novo QR Code para esta conexão.',
          reason: instanceCheck.status === 504 ? 'gateway_timeout' : 'gateway_unavailable',
        },
        { status: instanceCheck.status || 502 }
      );
    }

    // 4. AÇÃO: DESCONECTAR (LOGOUT)
    if (action === 'disconnect') {
      const connectionId = body.connectionId as string;
      const conn = await getWhatsAppConnectionAsync(connectionId, userId);

      if (!conn) {
        return timedJson(
          { ok: false, error: 'Conexão não encontrada ou não pertence a este usuário.' },
          { status: 404 }
        );
      }

      try {
        await fetch(`${baseUrl}/instance/logout/${encodeURIComponent(conn.instanceName)}`, {
          method: 'DELETE',
          headers: { apikey: apiKey },
        });
      } catch {}

      conn.status = 'disconnected';
      conn.qrCodeBase64 = undefined;
      conn.lastPingAt = new Date().toISOString();
      await saveWhatsAppConnection(conn);

      return timedJson({
        ok: true,
        message: `Conexão "${conn.label}" desconectada.`,
        connection: safeConnection(conn),
      });
    }

    // 5. AÇÃO: REMOVER (EXCLUIR CONEXÃO, PAUSAR REGRAS E LIMPAR GATEWAY)
    if (action === 'delete') {
      const connectionId = body.connectionId as string;
      const forceLocalOnly = Boolean(body.forceLocalOnly);
      const conn = await getWhatsAppConnectionAsync(connectionId, userId);

      if (!conn) {
        return timedJson(
          { ok: false, error: 'Conexão não encontrada ou não pertence a este usuário.' },
          { status: 404 }
        );
      }

      // Contagem de vínculos afetados para registro
      const db = readDatabase();
      const groupsCount = (db.groups || []).filter(
        (g) => g.connectionId === conn.id || (!g.connectionId && conn.isDefault)
      ).length;
      const sourcesCount = (db.sources || []).filter((s) => s.connectionId === conn.id).length;
      const jobsCount = (db.jobs || []).filter((j) => j.connectionId === conn.id).length;

      // 1. Tentar remover a instância no gateway Evolution
      let gatewayDeleted = false;
      let gatewayError: string | undefined;

      try {
        const delRes = await fetch(`${baseUrl}/instance/delete/${encodeURIComponent(conn.instanceName)}`, {
          method: 'DELETE',
          headers: { apikey: apiKey },
        });

        // 200/204 ou 404 (instância remota já não existia) = sucesso da limpeza remota
        if (delRes.ok || delRes.status === 404) {
          gatewayDeleted = true;
        } else {
          gatewayError = `Gateway retornou HTTP ${delRes.status}`;
        }
      } catch (err: any) {
        gatewayError = err?.message || 'Gateway indisponível';
      }

      // Se o gateway estiver indisponível e o usuário NÃO solicitou remoção local forçada:
      if (!gatewayDeleted && !forceLocalOnly) {
        return timedJson(
          {
            ok: false,
            error: 'O gateway WhatsApp está indisponível para encerrar a sessão remota no momento.',
            reason: 'gateway_unavailable',
            canForceLocal: true,
            technicalDetails: gatewayError,
            impact: {
              groupsCount,
              sourcesCount,
              jobsCount,
            },
          },
          { status: 502 }
        );
      }

      // 2. Concluir a remoção no Supabase e no banco persistido
      // (deleteWhatsAppConnection já pausa regras vinculadas e preserva mensagens/jobs)
      await deleteWhatsAppConnection(connectionId, userId);

      return timedJson({
        ok: true,
        message: `Conexão "${conn.label}" removida com sucesso.`,
        gatewayDeleted,
        partial: !gatewayDeleted && forceLocalOnly,
        warning:
          !gatewayDeleted && forceLocalOnly
            ? 'Cadastro removido do painel. Como o gateway estava indisponível, a sessão remota pode continuar ativa no WhatsApp até que o gateway seja restaurado.'
            : undefined,
      });
    }

    // 6. AÇÃO: DEFINIR COMO PADRÃO
    if (action === 'set_default') {
      const connectionId = body.connectionId as string;
      const success = await setDefaultWhatsAppConnection(connectionId, userId);
      if (!success) {
        return timedJson(
          { ok: false, error: 'Conexão não encontrada ou não pertence a este usuário.' },
          { status: 404 }
        );
      }
      return timedJson({ ok: true, message: 'Conexão padrão atualizada.' });
    }

    // 7. AÇÃO: ATUALIZAR APELIDO (LABEL)
    if (action === 'update_label') {
      const connectionId = body.connectionId as string;
      const newLabel = String(body.label || '').trim();
      const conn = await getWhatsAppConnectionAsync(connectionId, userId);
      if (!conn) {
        return timedJson(
          { ok: false, error: 'Conexão não encontrada ou não pertence a este usuário.' },
          { status: 404 }
        );
      }
      if (newLabel) {
        conn.label = newLabel;
        await saveWhatsAppConnection(conn);
      }
      return timedJson({ ok: true, label: conn.label });
    }

    return timedJson({ ok: false, error: `Ação "${action}" desconhecida.` }, { status: 400 });
  } catch (err: any) {
    return timedJson(
      { ok: false, error: err?.message || 'Erro interno ao gerenciar conexões WhatsApp.' },
      { status: 500 }
    );
  }
}

function safeConnection(connection: import('@/lib/types').WhatsAppConnection) {
  const { id, label, instanceName, status, ownerJid, phoneNumber, profileName, profilePicUrl, lastPingAt, isDefault } = connection;
  return { id, label, instanceName, status, ownerJid, phoneNumber, profileName, profilePicUrl, lastPingAt, isDefault };
}
