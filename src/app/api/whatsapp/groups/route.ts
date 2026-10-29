import { NextRequest, NextResponse } from 'next/server';
import {
  readDatabase,
  writeDatabase,
  ensureValidUuid,
  isValidGatewayUrl,
  getActiveEvolutionConfig,
  compareWhatsAppIds,
  normalizeWhatsAppPhone,
} from '@/lib/server/storage';
import { WhatsAppGroup } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const db = readDatabase();
    const shouldRefresh = req.nextUrl.searchParams.get('refresh') === 'true';

    const config = getActiveEvolutionConfig(db.whatsapp);

    let isLive = false;
    let syncWarning: string | undefined = undefined;

    // Se solicitado refresh e a Evolution estiver configurada, busca ao vivo
    if (shouldRefresh && config.baseUrl && config.apiKey && config.instanceName) {
      const urlCheck = isValidGatewayUrl(config.baseUrl);
      if (urlCheck.valid) {
        try {
          const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');

          // Confirma a identidade da conta a cada sincronização; a instância pode
          // continuar com o mesmo nome depois de parear outro número.
          let ownerJid = '';
          let myPhone = '';

          try {
            const instRes = await fetch(
              `${cleanBaseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(config.instanceName)}`,
              { headers: { apikey: config.apiKey } }
            );
            if (instRes.ok) {
              const instData = await instRes.json();
              const instances = Array.isArray(instData) ? instData : [instData];
              const instObj = instances.find((item) =>
                item?.name === config.instanceName || item?.instanceName === config.instanceName
              );
              if (instObj) {
                const confirmedOwner = String(instObj.ownerJid || '').trim();
                if (confirmedOwner) {
                  ownerJid = confirmedOwner;
                  myPhone = normalizeWhatsAppPhone(confirmedOwner);
                  db.whatsapp.ownerJid = ownerJid;
                  db.whatsapp.phoneNumber = myPhone;
                }
                db.whatsapp.profileName = String(instObj.profileName || '').trim();
              }
            }
          } catch {
            // A lista ao vivo ainda pode ser consultada; permissões ficam não verificadas.
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 25000);

          const res = await fetch(
            `${cleanBaseUrl}/group/fetchAllGroups/${encodeURIComponent(config.instanceName)}?getParticipants=true`,
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
              const existingMap = new Map<string, WhatsAppGroup>();
              if (ownerJid && (!db.whatsapp.groupsOwnerJid || db.whatsapp.groupsOwnerJid === ownerJid)) {
                (db.groups || []).forEach((g) => existingMap.set(g.groupJid, g));
              }

              const nowIso = new Date().toISOString();

              const updatedGroups: WhatsAppGroup[] = rawGroups.map((rg: Record<string, unknown>) => {
                const groupJid = String(rg.id || rg.jid || '');
                const name = String(rg.subject || rg.name || 'Grupo sem nome');
                const existing = existingMap.get(groupJid);

                const participants = Array.isArray(rg.participants) ? rg.participants : [];
                const participantCount = Number(rg.size) || participants.length || 0;
                const isAnnounce = Boolean(rg.announce);

                // Determina o papel da conta no grupo sem usar includes parcial
                let isAdmin = false;
                let canPost = true;
                let permissionStatus: 'verified_admin' | 'verified_member' | 'unverified' | 'restricted_readonly' = 'unverified';
                let roleDescription = 'Permissão não verificada';

                // Busca o participante correspondente à conta conectada
                const me = participants.find((p: Record<string, unknown>) => {
                  const pId = String(p.id || '');
                  const pPhone = String(p.phoneNumber || '');
                  return compareWhatsAppIds(ownerJid || myPhone, pId, pPhone);
                });

                if (me) {
                  if (me.admin === 'admin' || me.admin === 'superadmin') {
                    isAdmin = true;
                    canPost = true;
                    permissionStatus = 'verified_admin';
                    roleDescription = me.admin === 'superadmin' ? 'Administrador Criador' : 'Administrador';
                  } else if (isAnnounce) {
                    isAdmin = false;
                    canPost = false;
                    permissionStatus = 'restricted_readonly';
                    roleDescription = 'Somente Leitura (Restrito)';
                  } else {
                    isAdmin = false;
                    canPost = true;
                    permissionStatus = 'verified_member';
                    roleDescription = 'Membro (envio liberado)';
                  }
                } else {
                  // Se não foi possível verificar a identidade nos participantes
                  isAdmin = false;
                  permissionStatus = 'unverified';
                  if (isAnnounce) {
                    canPost = false;
                    roleDescription = 'Permissão não verificada (Restrito)';
                  } else {
                    canPost = true;
                    roleDescription = 'Permissão não verificada';
                  }
                }

                return {
                  id: existing?.id || ensureValidUuid(),
                  userId: existing?.userId || db.settings.userId || '00000000-0000-0000-0000-000000000001',
                  groupJid,
                  name,
                  participantCount,
                  isAdmin,
                  canPost,
                  permissionStatus,
                  isAnnounce,
                  roleDescription,
                  isOrigin: existing?.isOrigin || false,
                  isDestination: existing?.isDestination || false,
                  isTestGroup: existing?.isTestGroup || false,
                  lastSyncedAt: nowIso,
                };
              });

              db.groups = updatedGroups;
              db.whatsapp.groupsOwnerJid = ownerJid || undefined;
              writeDatabase(db);
            }
          } else {
            syncWarning = `Gateway retornou código ${res.status}. Exibindo dados locais em cache.`;
          }
        } catch (fetchErr) {
          syncWarning = 'Não foi possível conectar ao gateway no momento. Exibindo grupos locais em cache.';
          console.warn('Falha ao sincronizar grupos da Evolution API:', fetchErr);
        }
      }
    }

    const cacheBelongsToAccount = Boolean(
      db.whatsapp.status === 'connected' &&
      db.whatsapp.ownerJid &&
      db.whatsapp.groupsOwnerJid === db.whatsapp.ownerJid
    );
    const visibleGroups = isLive || cacheBelongsToAccount ? db.groups || [] : [];
    const sanitizedGroups = visibleGroups.map((g) => ({
      ...g,
      canPost: typeof g.canPost === 'boolean' ? g.canPost : Boolean(g.isAdmin || !g.isAnnounce),
      roleDescription: g.roleDescription || (g.isAdmin ? 'Administrador' : 'Permissão não verificada'),
      permissionStatus: g.permissionStatus || (g.isAdmin ? 'verified_admin' : 'unverified'),
    }));

    // Determina a data do cache mais recente
    const mostRecentSync = visibleGroups.reduce<string | null>((latest, g) => {
      if (!g.lastSyncedAt) return latest;
      if (!latest) return g.lastSyncedAt;
      return new Date(g.lastSyncedAt) > new Date(latest) ? g.lastSyncedAt : latest;
    }, null);

    return NextResponse.json({
      ok: true,
      groups: sanitizedGroups,
      total: sanitizedGroups.length,
      isLive,
      cached: !isLive,
      cachedAt: mostRecentSync,
      warning: syncWarning,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, groupJid, isTestGroup, isOrigin, isDestination } = body;
    const db = readDatabase();

    if (!groupJid) {
      return NextResponse.json({ ok: false, error: 'Identificador do grupo ausente.' }, { status: 400 });
    }

    const group = (db.groups || []).find((g) => g.groupJid === groupJid);
    if (!group) {
      return NextResponse.json({ ok: false, error: 'Grupo não encontrado.' }, { status: 404 });
    }

    // 1. Marcar como Grupo de Teste Homologado
    if (action === 'set_test_group') {
      db.groups.forEach((g) => {
        g.isTestGroup = g.groupJid === groupJid;
      });
      writeDatabase(db);
      return NextResponse.json({
        ok: true,
        message: `Grupo "${group.name}" definido como grupo de teste oficial.`,
        groups: db.groups,
      });
    }

    // 2. Alternar Origem/Destino
    if (action === 'toggle_role') {
      if (typeof isOrigin === 'boolean') group.isOrigin = isOrigin;
      if (typeof isDestination === 'boolean') {
        if (isDestination && group.canPost === false) {
          return NextResponse.json(
            { ok: false, error: 'Este grupo não permite envio por não-administradores e não pode ser destino.' },
            { status: 400 }
          );
        }
        group.isDestination = isDestination;
      }
      writeDatabase(db);
      return NextResponse.json({ ok: true, group, groups: db.groups });
    }

    // 3. Atualizar propriedades genéricas
    if (typeof isTestGroup === 'boolean') {
      group.isTestGroup = isTestGroup;
    }
    writeDatabase(db);

    return NextResponse.json({ ok: true, group, groups: db.groups });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
