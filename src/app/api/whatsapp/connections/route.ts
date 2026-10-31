import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkApiAuth } from '@/lib/server/auth';
import {
  readDatabase,
  writeDatabase,
  ensureValidUuid,
  listWhatsAppConnections,
  getWhatsAppConnection,
  saveWhatsAppConnection,
  deleteWhatsAppConnection,
  setDefaultWhatsAppConnection,
  getActiveEvolutionConfig,
  normalizeWhatsAppPhone,
} from '@/lib/server/storage';
import { WhatsAppConnection, WhatsAppGroup } from '@/lib/types';

export async function GET(req: NextRequest) {
  const auth = checkApiAuth(req);
  if (!auth.authorized || !auth.session) {
    return auth.response!;
  }

  const userId = auth.session.userId;
  const db = readDatabase();
  const connections = listWhatsAppConnections(userId);

  // Mapear contagem de grupos reais por conexão
  const enrichedConnections = connections.map((conn) => {
    const groupsCount = (db.groups || []).filter(
      (g) => g.connectionId === conn.id || (!g.connectionId && conn.isDefault)
    ).length;

    return {
      id: conn.id,
      label: conn.label || 'WhatsApp',
      instanceName: conn.instanceName,
      status: conn.status,
      phoneNumber: conn.phoneNumber || undefined,
      ownerJid: conn.ownerJid || undefined,
      profileName: conn.profileName || undefined,
      profilePicUrl: conn.profilePicUrl || undefined,
      batteryLevel: conn.batteryLevel,
      lastPingAt: conn.lastPingAt,
      lastSyncedAt: conn.lastSyncedAt,
      isDefault: conn.isDefault,
      groupsCount,
    };
  });

  return NextResponse.json({
    ok: true,
    connections: enrichedConnections,
    total: enrichedConnections.length,
  });
}

export async function POST(req: NextRequest) {
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
      | 'update_label';

    const defaultCfg = getActiveEvolutionConfig();
    const baseUrl = (body.baseUrl || defaultCfg.baseUrl || '').replace(/\/+$/, '');
    const apiKey = body.apiKey || defaultCfg.apiKey;

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { ok: false, error: 'Evolution Gateway não configurado no servidor (baseUrl ou apiKey ausentes).' },
        { status: 500 }
      );
    }

    // 1. AÇÃO: CRIAR NOVA CONEXÃO E GERAR QR CODE
    if (action === 'create') {
      const label = String(body.label || '').trim() || 'Meu WhatsApp';
      const userShort = userId.replace(/-/g, '').slice(0, 8);
      const randomSuffix = crypto.randomBytes(3).toString('hex');
      const instanceName = `radar_${userShort}_${randomSuffix}`;
      const connectionId = ensureValidUuid();
      const webhookSecret = crypto.randomUUID();

      // Detectar URL pública do host para o Webhook
      const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').trim();
      const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
      const webhookUrl = `${proto}://${host}/api/webhook/evolution`;

      // 1. Criar instância na Evolution API
      const createController = new AbortController();
      const createTimeout = setTimeout(() => createController.abort(), 20000);

      let qrBase64: string | undefined;

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
          signal: createController.signal,
        });
        clearTimeout(createTimeout);

        if (!createRes.ok) {
          const errText = await createRes.text().catch(() => '');
          return NextResponse.json(
            { ok: false, error: `Falha ao criar instância na Evolution API: ${errText.slice(0, 150)}` },
            { status: createRes.status }
          );
        }

        const createData = await createRes.json().catch(() => ({}));
        qrBase64 =
          createData?.qrcode?.base64 ||
          createData?.base64 ||
          createData?.instance?.qrcode?.base64 ||
          undefined;
      } catch (err: any) {
        clearTimeout(createTimeout);
        return NextResponse.json(
          { ok: false, error: `Erro de rede ao conectar à Evolution API: ${err?.message || err}` },
          { status: 502 }
        );
      }

      // Se não veio QR code no create, busca explicitamente em /instance/connect
      if (!qrBase64) {
        try {
          const connRes = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
            headers: { apikey: apiKey },
          });
          if (connRes.ok) {
            const connData = await connRes.json();
            qrBase64 = connData?.base64 || connData?.qrcode?.base64 || undefined;
          }
        } catch {}
      }

      // 2. Configurar Webhook exclusivo para esta instância
      try {
        await fetch(`${baseUrl}/webhook/set/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify({
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            webhookByEvents: false,
            events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
            headers: {
              'x-webhook-secret': webhookSecret,
            },
          }),
        });
      } catch {}

      // 3. Salvar nova conexão
      const newConnection: WhatsAppConnection = {
        id: connectionId,
        userId,
        label,
        instanceName,
        baseUrl,
        apiKey,
        status: qrBase64 ? 'qrcode' : 'connecting',
        qrCodeBase64: qrBase64,
        webhookUrl,
        webhookSecret,
        isDefault: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveWhatsAppConnection(newConnection);

      return NextResponse.json({
        ok: true,
        connectionId,
        instanceName,
        label,
        status: newConnection.status,
        qrCodeBase64: qrBase64,
      });
    }

    // 2. AÇÃO: VERIFICAR STATUS DO QR CODE / POLLING DE PAREAMENTO
    if (action === 'poll_qr') {
      const connectionId = body.connectionId as string;
      const conn = getWhatsAppConnection(connectionId, userId);

      if (!conn) {
        return NextResponse.json({ ok: false, error: 'Conexão não encontrada.' }, { status: 404 });
      }

      const instanceName = conn.instanceName;

      // Consultar estado da conexão na Evolution API
      let state = 'disconnected';
      try {
        const stateRes = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
          headers: { apikey: apiKey },
        });
        if (stateRes.ok) {
          const stateData = await stateRes.json();
          state = (stateData?.instance?.state || stateData?.state || '').toLowerCase();
        }
      } catch {}

      if (state === 'open' || state === 'connected') {
        // Obter identidade confirmada da conta (ownerJid, profileName, phoneNumber)
        let ownerJid = '';
        let phoneNumber = '';
        let profileName = '';
        let profilePicUrl = '';

        try {
          const instRes = await fetch(
            `${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
            { headers: { apikey: apiKey } }
          );
          if (instRes.ok) {
            const instData = await instRes.json();
            const list = Array.isArray(instData) ? instData : [instData];
            const found = list.find((i) => i.name === instanceName || i.instanceName === instanceName);
            if (found) {
              ownerJid = String(found.ownerJid || found.owner || '').trim();
              profileName = String(found.profileName || '').trim();
              profilePicUrl = String(found.profilePicUrl || found.profilePictureUrl || '').trim();
              if (ownerJid) {
                phoneNumber = normalizeWhatsAppPhone(ownerJid);
              }
            }
          }
        } catch {}

        conn.status = 'connected';
        conn.ownerJid = ownerJid || conn.ownerJid;
        conn.phoneNumber = phoneNumber || conn.phoneNumber;
        conn.profileName = profileName || conn.profileName;
        conn.profilePicUrl = profilePicUrl || conn.profilePicUrl;
        conn.qrCodeBase64 = undefined;
        conn.lastPingAt = new Date().toISOString();
        await saveWhatsAppConnection(conn);

        // Disparar sincronização inicial de grupos da nova conexão de forma rápida
        try {
          const grpRes = await fetch(
            `${baseUrl}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
            { headers: { apikey: apiKey } }
          );
          if (grpRes.ok) {
            const rawGroups = await grpRes.json();
            if (Array.isArray(rawGroups)) {
              const db = readDatabase();
              const nowIso = new Date().toISOString();
              const initialGroups: WhatsAppGroup[] = rawGroups.map((rg) => ({
                id: ensureValidUuid(),
                userId,
                connectionId: conn.id,
                groupJid: String(rg.id || rg.jid || ''),
                name: String(rg.subject || rg.name || 'Grupo sem nome'),
                participantCount: Number(rg.size || rg.participantsCount || 0),
                isAdmin: false,
                isOrigin: false,
                isDestination: false,
                lastSyncedAt: nowIso,
              }));

              // Mescla grupos no banco
              const otherGroups = (db.groups || []).filter((g) => g.connectionId !== conn.id);
              db.groups = [...otherGroups, ...initialGroups];
              conn.lastSyncedAt = nowIso;
              writeDatabase(db);
            }
          }
        } catch {}

        return NextResponse.json({
          ok: true,
          status: 'connected',
          phoneNumber: conn.phoneNumber,
          profileName: conn.profileName,
          profilePicUrl: conn.profilePicUrl,
        });
      }

      // Se ainda não conectou, verifica se o QR Code atualizou
      let updatedQr: string | undefined = conn.qrCodeBase64;
      try {
        const qrRes = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
          headers: { apikey: apiKey },
        });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          const freshQr = qrData?.base64 || qrData?.qrcode?.base64;
          if (freshQr) {
            updatedQr = freshQr;
            conn.qrCodeBase64 = freshQr;
            conn.status = 'qrcode';
            await saveWhatsAppConnection(conn);
          }
        }
      } catch {}

      return NextResponse.json({
        ok: true,
        status: state === 'connecting' ? 'connecting' : 'qrcode',
        qrCodeBase64: updatedQr,
      });
    }

    // 3. AÇÃO: RECONECTAR INSTÂNCIA EXISTENTE (GERAR NOVO QR CODE)
    if (action === 'reconnect') {
      const connectionId = body.connectionId as string;
      const conn = getWhatsAppConnection(connectionId, userId);

      if (!conn) {
        return NextResponse.json({ ok: false, error: 'Conexão não encontrada.' }, { status: 404 });
      }

      let qrBase64: string | undefined;
      try {
        const connRes = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(conn.instanceName)}`, {
          headers: { apikey: apiKey },
        });
        if (connRes.ok) {
          const connData = await connRes.json();
          qrBase64 = connData?.base64 || connData?.qrcode?.base64;
        }
      } catch {}

      conn.status = 'qrcode';
      conn.qrCodeBase64 = qrBase64;
      await saveWhatsAppConnection(conn);

      return NextResponse.json({
        ok: true,
        connectionId: conn.id,
        status: 'qrcode',
        qrCodeBase64,
      });
    }

    // 4. AÇÃO: DESCONECTAR (LOGOUT)
    if (action === 'disconnect') {
      const connectionId = body.connectionId as string;
      const conn = getWhatsAppConnection(connectionId, userId);

      if (!conn) {
        return NextResponse.json({ ok: false, error: 'Conexão não encontrada.' }, { status: 404 });
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

      return NextResponse.json({
        ok: true,
        message: `Conexão "${conn.label}" desconectada.`,
      });
    }

    // 5. AÇÃO: REMOVER (EXCLUIR INSTÂNCIA E VÍNCULOS)
    if (action === 'delete') {
      const connectionId = body.connectionId as string;
      const conn = getWhatsAppConnection(connectionId, userId);

      if (!conn) {
        return NextResponse.json({ ok: false, error: 'Conexão não encontrada.' }, { status: 404 });
      }

      // Tenta remover na Evolution API
      try {
        await fetch(`${baseUrl}/instance/delete/${encodeURIComponent(conn.instanceName)}`, {
          method: 'DELETE',
          headers: { apikey: apiKey },
        });
      } catch {}

      await deleteWhatsAppConnection(connectionId, userId);

      return NextResponse.json({
        ok: true,
        message: `Conexão "${conn.label}" removida com sucesso.`,
      });
    }

    // 6. AÇÃO: DEFINIR COMO PADRÃO
    if (action === 'set_default') {
      const connectionId = body.connectionId as string;
      await setDefaultWhatsAppConnection(connectionId, userId);
      return NextResponse.json({ ok: true, message: 'Conexão padrão atualizada.' });
    }

    // 7. AÇÃO: ATUALIZAR APELIDO (LABEL)
    if (action === 'update_label') {
      const connectionId = body.connectionId as string;
      const newLabel = String(body.label || '').trim();
      const conn = getWhatsAppConnection(connectionId, userId);
      if (!conn) {
        return NextResponse.json({ ok: false, error: 'Conexão não encontrada.' }, { status: 404 });
      }
      if (newLabel) {
        conn.label = newLabel;
        await saveWhatsAppConnection(conn);
      }
      return NextResponse.json({ ok: true, label: conn.label });
    }

    return NextResponse.json({ ok: false, error: `Ação "${action}" desconhecida.` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno ao gerenciar conexões WhatsApp.' },
      { status: 500 }
    );
  }
}

