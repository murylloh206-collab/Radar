import { NextRequest, NextResponse } from 'next/server';
import {
  readDatabase,
  writeDatabase,
  ensureValidUuid,
  isValidGatewayUrl,
  getActiveEvolutionConfig,
  getWhatsAppConnection,
  normalizeWhatsAppPhone,
  saveWhatsAppConnection,
} from '@/lib/server/storage';
import { WhatsAppGroup } from '@/lib/types';
import { checkApiAuth } from '@/lib/server/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = checkApiAuth(req);
    const userId = auth.authorized && auth.session ? auth.session.userId : undefined;

    const db = readDatabase();
    const connectionIdParam = req.nextUrl.searchParams.get('connectionId') || undefined;
    const shouldSync = req.nextUrl.searchParams.get('refresh') === 'true' || req.nextUrl.searchParams.get('sync') === 'true';

    // Obter a conexão WhatsApp alvo
    const conn = getWhatsAppConnection(connectionIdParam, userId);
    const activeConnectionId = conn?.id;

    // 1. CARREGAMENTO IMEDIATO DO BANCO
    // Filtra os grupos pertencentes à conexão solicitada (ou legados da conexão padrão)
    const storedGroups = (db.groups || []).filter((g) => {
      if (activeConnectionId && g.connectionId) {
        return g.connectionId === activeConnectionId;
      }
      // Grupos legados sem connectionId pertencem à conexão padrão
      return conn?.isDefault;
    });

    const lastSyncedAt = conn?.lastSyncedAt || storedGroups[0]?.lastSyncedAt || undefined;

    // Se NÃO foi solicitado sync, responde instantaneamente com os dados em cache/banco
    if (!shouldSync) {
      return NextResponse.json({
        ok: true,
        groups: storedGroups,
        total: storedGroups.length,
        lastSyncedAt,
        connectionId: activeConnectionId,
        isLive: false,
      });
    }

    // 2. ATUALIZAÇÃO RÁPIDA EM SEGUNDO PLANO / SOB DEMANDA
    if (!conn) {
      return NextResponse.json({
        ok: true,
        groups: storedGroups,
        total: storedGroups.length,
        lastSyncedAt,
        syncWarning: 'Nenhuma conexão WhatsApp configurada.',
      });
    }

    const config = {
      baseUrl: conn.baseUrl || getActiveEvolutionConfig().baseUrl,
      apiKey: conn.apiKey || getActiveEvolutionConfig().apiKey,
      instanceName: conn.instanceName,
    };

    if (!config.baseUrl || !config.apiKey || !config.instanceName) {
      return NextResponse.json({
        ok: true,
        groups: storedGroups,
        total: storedGroups.length,
        lastSyncedAt,
        syncWarning: 'Instância da Evolution API não configurada para esta conta.',
      });
    }

    const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');
    let isLive = false;
    let syncWarning: string | undefined = undefined;

    try {
      // 2.1 Confirmar identidade da conta (para invalidação segura se houver troca de chip)
      let ownerJid = conn.ownerJid || '';
      try {
        const instRes = await fetch(
          `${cleanBaseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(config.instanceName)}`,
          { headers: { apikey: config.apiKey } }
        );
        if (instRes.ok) {
          const instData = await instRes.json();
          const list = Array.isArray(instData) ? instData : [instData];
          const found = list.find((i) => i.name === config.instanceName || i.instanceName === config.instanceName);
          if (found && found.ownerJid) {
            const confirmedOwner = String(found.ownerJid).trim();
            // Se o chip foi trocado (ownerJid diferente do anterior), limpa grupos antigos imediatamente!
            if (conn.ownerJid && conn.ownerJid !== confirmedOwner) {
              db.groups = (db.groups || []).filter((g) => g.connectionId !== conn.id);
            }
            conn.ownerJid = confirmedOwner;
            conn.phoneNumber = normalizeWhatsAppPhone(confirmedOwner);
            conn.profileName = String(found.profileName || conn.profileName || '').trim();
            ownerJid = confirmedOwner;
          }
        }
      } catch {}

      // 2.2 Buscar grupos de forma RÁPIDA (getParticipants=false evita sobrecarga de memória e timeouts)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(
        `${cleanBaseUrl}/group/fetchAllGroups/${encodeURIComponent(config.instanceName)}?getParticipants=false`,
        {
          headers: { apikey: config.apiKey },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (res.ok) {
        const rawGroups = await res.json();
        if (Array.isArray(rawGroups)) {
          isLive = true;
          const nowIso = new Date().toISOString();

          // Mapear grupos existentes para preservar preferências (origem, destino, etc)
          const existingMap = new Map<string, WhatsAppGroup>();
          storedGroups.forEach((g) => existingMap.set(g.groupJid, g));

          const updatedList: WhatsAppGroup[] = rawGroups.map((rg: Record<string, any>) => {
            const groupJid = String(rg.id || rg.jid || '');
            const name = String(rg.subject || rg.name || 'Grupo sem nome');
            const existing = existingMap.get(groupJid);

            return {
              id: existing?.id || ensureValidUuid(),
              userId: conn.userId,
              connectionId: conn.id,
              groupJid,
              name,
              pictureUrl: rg.pictureUrl || rg.profilePictureUrl || existing?.pictureUrl,
              participantCount: Number(rg.size || rg.participantsCount || existing?.participantCount || 0),
              isAdmin: Boolean(existing?.isAdmin),
              canPost: existing?.canPost !== undefined ? existing.canPost : true,
              isAnnounce: Boolean(rg.announce || existing?.isAnnounce),
              permissionStatus: existing?.permissionStatus || 'unverified',
              isOrigin: Boolean(existing?.isOrigin),
              isDestination: Boolean(existing?.isDestination),
              isTestGroup: Boolean(existing?.isTestGroup),
              lastSyncedAt: nowIso,
            };
          });

          // Atualizar no banco
          const otherGroups = (db.groups || []).filter((g) => g.connectionId !== conn.id);
          db.groups = [...otherGroups, ...updatedList];

          conn.lastSyncedAt = nowIso;
          conn.lastPingAt = nowIso;
          await saveWhatsAppConnection(conn);
          writeDatabase(db);

          return NextResponse.json({
            ok: true,
            groups: updatedList,
            total: updatedList.length,
            lastSyncedAt: nowIso,
            connectionId: conn.id,
            isLive: true,
          });
        }
      } else {
        syncWarning = `Servidor WhatsApp retornou status ${res.status}. Dados em cache mantidos.`;
      }
    } catch (err: any) {
      syncWarning = 'A sincronização com a Evolution API atingiu o tempo limite. Dados anteriores preservados.';
    }

    // Se a sincronização falhou, preserva os dados existentes sem apagá-los
    return NextResponse.json({
      ok: true,
      groups: storedGroups,
      total: storedGroups.length,
      lastSyncedAt,
      connectionId: activeConnectionId,
      isLive: false,
      syncWarning,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro ao consultar grupos do WhatsApp.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = checkApiAuth(req);
    const userId = auth.authorized && auth.session ? auth.session.userId : undefined;

    const body = await req.json().catch(() => ({}));
    const connectionId = body.connectionId;
    const action = body.action || 'sync';

    if (action === 'sync') {
      // Redireciona internamente para o fluxo de sync do GET
      const url = new URL(req.url);
      url.searchParams.set('refresh', 'true');
      if (connectionId) url.searchParams.set('connectionId', connectionId);
      const fakeReq = new NextRequest(url.toString(), { headers: req.headers });
      return GET(fakeReq);
    }

    return NextResponse.json({ ok: false, error: 'Ação não suportada.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erro ao processar requisição.' }, { status: 500 });
  }
}
