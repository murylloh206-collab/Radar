import { NextRequest, NextResponse } from 'next/server';
import {
  readDatabase,
  writeDatabase,
  isValidGatewayUrl,
  getActiveEvolutionConfig,
  sanitizeWhatsApp,
  diagnoseEvolutionError,
  normalizeWhatsAppPhone,
} from '@/lib/server/storage';

export async function GET(req: NextRequest) {
  try {
    const db = readDatabase();
    const shouldCheckLive = req.nextUrl?.searchParams?.get('check') === 'true';

    // Se o cliente solicitou checagem ao vivo do estado real da instância
    if (shouldCheckLive) {
      const config = getActiveEvolutionConfig(db.whatsapp);

      if (!config.baseUrl || !config.apiKey || !config.instanceName) {
        db.whatsapp.status = 'disconnected';
        writeDatabase(db);
        return NextResponse.json(
          {
            ok: false,
            error: 'Servidor da Evolution API ou nome da instância não configurado. Defina as credenciais em Ajustes.',
            reason: 'unconfigured',
            whatsapp: sanitizeWhatsApp(db.whatsapp),
          },
          { status: 400 }
        );
      }

      const validation = isValidGatewayUrl(config.baseUrl);
      if (!validation.valid) {
        db.whatsapp.status = 'disconnected';
        writeDatabase(db);
        return NextResponse.json(
          { ok: false, error: validation.reason, whatsapp: sanitizeWhatsApp(db.whatsapp) },
          { status: 400 }
        );
      }

      try {
        const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');
        let res: Response | null = null;
        let lastFetchErr: unknown = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000); // 30s por tentativa para absorver cold start no Render
          try {
            res = await fetch(
              `${cleanBaseUrl}/instance/connectionState/${encodeURIComponent(config.instanceName)}`,
              {
                headers: { apikey: config.apiKey },
                signal: controller.signal,
              }
            );
            clearTimeout(timeout);
            if (res.ok || (res.status < 500 && res.status !== 408)) {
              break;
            }
          } catch (err) {
            clearTimeout(timeout);
            lastFetchErr = err;
          }
          if (attempt === 1) {
            await new Promise((r) => setTimeout(r, 2500));
          }
        }

        if (!res) {
          throw lastFetchErr || new Error('Timeout ao contatar Evolution API');
        }

        if (res.ok) {
          const data = await res.json();
          const isOpen = data.state === 'open' || data.instance?.state === 'open';
          const isClosed = data.state === 'close' || data.instance?.state === 'close' || data.state === 'closed';

          if (isOpen) {
            db.whatsapp.status = 'connected';
            db.whatsapp.lastVerificationStatus = 'verified';
            db.whatsapp.lastVerificationError = undefined;
            db.whatsapp.lastPingAt = new Date().toISOString();
            db.whatsapp.qrCodeBase64 = undefined;
            // O nome da instância é técnico e não identifica o número pareado.
            // Reconsulta a identidade mesmo que já haja um número salvo, pois a
            // mesma instância pode ser pareada com outra conta WhatsApp.
            let confirmedOwner = String(data.instance?.owner || '').trim();
            let confirmedProfile = String(data.instance?.profileName || '').trim();
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
                  confirmedOwner = String(instObj.ownerJid || '').trim() || confirmedOwner;
                  confirmedProfile = String(instObj.profileName || '').trim() || confirmedProfile;
                }
              }
            } catch {
              // A conexão continua válida; a identidade fica sem confirmação.
            }
            db.whatsapp.ownerJid = confirmedOwner || undefined;
            db.whatsapp.phoneNumber = confirmedOwner ? normalizeWhatsAppPhone(confirmedOwner) : '';
            db.whatsapp.profileName = confirmedProfile;
          } else if (isClosed) {
            // Só grava disconnected quando o gateway responder validamente que a instância está fechada
            db.whatsapp.status = 'disconnected';
            db.whatsapp.lastVerificationStatus = 'verified';
            db.whatsapp.lastVerificationError = undefined;
          } else {
            // connecting ou outro estado transitório
            db.whatsapp.status = 'connecting';
            db.whatsapp.lastVerificationStatus = 'verified';
            db.whatsapp.lastVerificationError = undefined;
            db.whatsapp.lastPingAt = new Date().toISOString();
          }

          db.whatsapp.updatedAt = new Date().toISOString();
          writeDatabase(db);

          return NextResponse.json({
            ok: true,
            whatsapp: sanitizeWhatsApp(db.whatsapp),
            liveChecked: true,
          });
        } else {
          const errText = await res.text().catch(() => '');
          const diag = diagnoseEvolutionError(res.status, errText, null, config.instanceName);

          const isTemporary = diag.reason === 'timeout' || diag.reason === 'server_error' || diag.reason === 'unavailable' || res.status >= 500;
          if (isTemporary) {
            db.whatsapp.lastVerificationStatus = diag.reason === 'timeout' ? 'timeout' : 'unreachable';
            db.whatsapp.lastVerificationError = diag.message;
            // Preserva db.whatsapp.status e db.whatsapp.lastPingAt intactos!
          } else {
            db.whatsapp.status = 'disconnected';
            db.whatsapp.lastVerificationStatus = 'failed';
            db.whatsapp.lastVerificationError = diag.message;
          }

          db.whatsapp.updatedAt = new Date().toISOString();
          writeDatabase(db);

          const verificationState =
            db.whatsapp.status === 'connected' && db.whatsapp.lastPingAt
              ? 'last_known_connection'
              : db.whatsapp.status === 'connected'
              ? 'unreachable'
              : 'disconnected';

          return NextResponse.json(
            {
              ok: false,
              error: isTemporary ? 'Não foi possível verificar agora' : diag.message,
              concreteError: diag.message,
              categoryTitle: diag.categoryTitle,
              reason: diag.reason,
              verificationState,
              verificationStatus: db.whatsapp.lastVerificationStatus,
              lastPingAt: db.whatsapp.lastPingAt,
              whatsapp: sanitizeWhatsApp(db.whatsapp, {
                verificationStatus: db.whatsapp.lastVerificationStatus,
                verificationMessage: isTemporary ? 'Não foi possível verificar agora' : diag.message,
              }),
            },
            { status: diag.statusCode }
          );
        }
      } catch (fetchErr: unknown) {
        const diag = diagnoseEvolutionError(null, '', fetchErr, config.instanceName);

        const isTemporary =
          diag.reason === 'timeout' ||
          diag.reason === 'server_error' ||
          diag.reason === 'unavailable' ||
          diag.reason === 'invalid_url' ||
          diag.reason === 'network_error';

        if (isTemporary) {
          db.whatsapp.lastVerificationStatus = diag.reason === 'timeout' ? 'timeout' : 'unreachable';
          db.whatsapp.lastVerificationError = diag.message;
          // Preserva db.whatsapp.status e db.whatsapp.lastPingAt intactos!
        } else {
          db.whatsapp.status = 'disconnected';
          db.whatsapp.lastVerificationStatus = 'failed';
          db.whatsapp.lastVerificationError = diag.message;
        }

        db.whatsapp.updatedAt = new Date().toISOString();
        writeDatabase(db);

        const verificationState =
          db.whatsapp.status === 'connected' && db.whatsapp.lastPingAt
            ? 'last_known_connection'
            : db.whatsapp.status === 'connected'
            ? 'unreachable'
            : 'disconnected';

        return NextResponse.json(
          {
            ok: false,
            error: isTemporary ? 'Não foi possível verificar agora' : diag.message,
            concreteError: diag.message,
            categoryTitle: diag.categoryTitle,
            reason: diag.reason,
            verificationState,
            verificationStatus: db.whatsapp.lastVerificationStatus,
            lastPingAt: db.whatsapp.lastPingAt,
            whatsapp: sanitizeWhatsApp(db.whatsapp, {
              verificationStatus: db.whatsapp.lastVerificationStatus,
              verificationMessage: isTemporary ? 'Não foi possível verificar agora' : diag.message,
            }),
          },
          { status: diag.statusCode }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      whatsapp: sanitizeWhatsApp(db.whatsapp),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { baseUrl, apiKey, instanceName, action } = body;
    const db = readDatabase();

    const previousBaseUrl = db.whatsapp.baseUrl;

    if (baseUrl !== undefined) {
      const trimmedUrl = String(baseUrl).trim();
      if (trimmedUrl.length > 0) {
        const validation = isValidGatewayUrl(trimmedUrl);
        if (!validation.valid) {
          return NextResponse.json(
            { ok: false, error: validation.reason, whatsapp: sanitizeWhatsApp(db.whatsapp) },
            { status: 400 }
          );
        }
      }
      db.whatsapp.baseUrl = trimmedUrl;
    }

    // Não enviar chave salva anteriormente para um novo endereço arbitrário
    if (baseUrl !== undefined && String(baseUrl).trim() !== previousBaseUrl) {
      if (!apiKey || String(apiKey).trim().length === 0) {
        db.whatsapp.apiKey = '';
      }
    }

    if (apiKey !== undefined && String(apiKey).trim().length > 0) {
      db.whatsapp.apiKey = String(apiKey).trim();
    }
    if (instanceName !== undefined && String(instanceName).trim().length > 0) {
      db.whatsapp.instanceName = String(instanceName).trim();
    }

    const config = getActiveEvolutionConfig(db.whatsapp);

    // 1. DESCONECTAR / LOGOUT
    if (action === 'disconnect' || action === 'logout') {
      if (config.baseUrl && config.apiKey && config.instanceName) {
        try {
          const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');
          await fetch(`${cleanBaseUrl}/instance/logout/${encodeURIComponent(config.instanceName)}`, {
            method: 'DELETE',
            headers: { apikey: config.apiKey },
          }).catch(() => {});
        } catch {
          // ignora erro se a instância já estiver offline
        }
      }

      db.whatsapp.status = 'disconnected';
      db.whatsapp.phoneNumber = '';
      db.whatsapp.profileName = '';
      db.whatsapp.qrCodeBase64 = undefined;
      db.whatsapp.updatedAt = new Date().toISOString();
      writeDatabase(db);
      return NextResponse.json({ ok: true, whatsapp: sanitizeWhatsApp(db.whatsapp) });
    }

    // 2. INICIAR PAREAMENTO / OBTER QR CODE
    if (action === 'start_pairing' || action === 'get_qrcode') {
      if (!config.baseUrl || !config.apiKey || !config.instanceName) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Servidor da Evolution API ou nome da instância não configurado. Defina as credenciais no ambiente ou em Ajustes.',
            reason: 'unconfigured',
            whatsapp: sanitizeWhatsApp(db.whatsapp),
          },
          { status: 400 }
        );
      }

      const validation = isValidGatewayUrl(config.baseUrl);
      if (!validation.valid) {
        return NextResponse.json(
          { ok: false, error: validation.reason, whatsapp: sanitizeWhatsApp(db.whatsapp) },
          { status: 400 }
        );
      }

      const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');

      // REGRA: Só inicia o pareamento quando a instância estiver comprovadamente desconectada.
      // Se a checagem preliminar falhar (timeout ou erro temporário), NÃO avança automaticamente para gerar QR Code.
      let prelimCheckPassed = false;
      try {
        const stateController = new AbortController();
        const stateTimeout = setTimeout(() => stateController.abort(), 15000);

        const checkRes = await fetch(
          `${cleanBaseUrl}/instance/connectionState/${encodeURIComponent(config.instanceName)}`,
          {
            headers: { apikey: config.apiKey },
            signal: stateController.signal,
          }
        );
        clearTimeout(stateTimeout);

        if (checkRes.ok) {
          const stateData = await checkRes.json();
          const isOpen = stateData.state === 'open' || stateData.instance?.state === 'open';

          if (isOpen) {
            db.whatsapp.status = 'connected';
            db.whatsapp.lastVerificationStatus = 'verified';
            db.whatsapp.lastVerificationError = undefined;
            db.whatsapp.qrCodeBase64 = undefined;
            if (stateData.instance?.profileName) db.whatsapp.profileName = stateData.instance.profileName;
            if (stateData.instance?.owner) {
              db.whatsapp.phoneNumber = stateData.instance.owner.replace('@s.whatsapp.net', '');
            }
            db.whatsapp.lastPingAt = new Date().toISOString();
            db.whatsapp.updatedAt = new Date().toISOString();
            writeDatabase(db);

            return NextResponse.json({
              ok: true,
              alreadyConnected: true,
              message: 'A instância já está conectada e operacional no WhatsApp.',
              whatsapp: sanitizeWhatsApp(db.whatsapp),
            });
          }

          // Instância respondeu e não está 'open' (ex: close / closed)
          prelimCheckPassed = true;
        } else {
          const errText = await checkRes.text().catch(() => '');
          const diag = diagnoseEvolutionError(checkRes.status, errText, null, config.instanceName);
          return NextResponse.json(
            {
              ok: false,
              error: 'Não foi possível verificar o estado atual da instância no gateway antes do pareamento. Determine o estado real da instância antes de gerar um novo QR Code.',
              detail: diag.message,
              reason: diag.reason,
              verificationStatus: 'unreachable',
              whatsapp: sanitizeWhatsApp(db.whatsapp, {
                verificationStatus: 'unreachable',
                verificationMessage: 'Não foi possível verificar agora',
              }),
            },
            { status: diag.statusCode }
          );
        }
      } catch (checkErr: unknown) {
        const diag = diagnoseEvolutionError(null, '', checkErr, config.instanceName);
        return NextResponse.json(
          {
            ok: false,
            error: 'Não foi possível verificar o estado atual da instância no gateway antes do pareamento. Aguarde alguns instantes e tente novamente.',
            detail: diag.message,
            reason: diag.reason,
            verificationStatus: 'unreachable',
            whatsapp: sanitizeWhatsApp(db.whatsapp, {
              verificationStatus: 'unreachable',
              verificationMessage: 'Não foi possível verificar agora',
            }),
          },
          { status: diag.statusCode }
        );
      }

      if (!prelimCheckPassed) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Checagem preliminar falhou. Impossível iniciar pareamento.',
            reason: 'preliminary_check_failed',
            whatsapp: sanitizeWhatsApp(db.whatsapp),
          },
          { status: 502 }
        );
      }

      // Inicia pareamento na Evolution API (apenas quando verificado que a instância está fechada)
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000); // 20s para tolerar cold start de serviço hospedado

        const res = await fetch(
          `${cleanBaseUrl}/instance/connect/${encodeURIComponent(config.instanceName)}`,
          {
            method: 'GET',
            headers: { apikey: config.apiKey },
            signal: controller.signal,
          }
        );

        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const qrCode = data.base64 || data.qrcode?.base64 || data.code;
          const isAlreadyOpen = data.state === 'open' || data.instance?.state === 'open';

          if (isAlreadyOpen) {
            db.whatsapp.status = 'connected';
            db.whatsapp.lastVerificationStatus = 'verified';
            db.whatsapp.lastVerificationError = undefined;
            db.whatsapp.qrCodeBase64 = undefined;
            if (data.instance?.profileName) db.whatsapp.profileName = data.instance.profileName;
            if (data.instance?.owner) db.whatsapp.phoneNumber = data.instance.owner.replace('@s.whatsapp.net', '');
          } else if (qrCode) {
            db.whatsapp.status = 'connecting';
            db.whatsapp.lastVerificationStatus = 'verified';
            db.whatsapp.lastVerificationError = undefined;
            db.whatsapp.qrCodeBase64 = qrCode;
          }

          db.whatsapp.lastPingAt = new Date().toISOString();
          db.whatsapp.updatedAt = new Date().toISOString();
          writeDatabase(db);

          return NextResponse.json({
            ok: true,
            pairingCode: data.pairingCode,
            whatsapp: sanitizeWhatsApp(db.whatsapp),
          });
        } else {
          const errText = await res.text().catch(() => '');
          const diag = diagnoseEvolutionError(res.status, errText, null, config.instanceName);

          return NextResponse.json(
            {
              ok: false,
              error: diag.message,
              reason: diag.reason,
              whatsapp: sanitizeWhatsApp(db.whatsapp),
            },
            { status: diag.statusCode }
          );
        }
      } catch (fetchErr: unknown) {
        const diag = diagnoseEvolutionError(null, '', fetchErr, config.instanceName);

        return NextResponse.json(
          {
            ok: false,
            error: diag.message,
            reason: diag.reason,
            whatsapp: sanitizeWhatsApp(db.whatsapp),
          },
          { status: diag.statusCode }
        );
      }
    }

    // 3. CONSULTAR ESTADO DA CONEXÃO (POLL / TEST_CONNECTION)
    if (action === 'test_connection' || action === 'get_status' || action === 'poll') {
      if (!config.baseUrl || !config.apiKey || !config.instanceName) {
        db.whatsapp.status = 'disconnected';
        db.whatsapp.updatedAt = new Date().toISOString();
        writeDatabase(db);
        return NextResponse.json(
          {
            ok: false,
            error: 'Servidor da Evolution API ou nome da instância não configurado. Defina as credenciais no ambiente ou em Ajustes.',
            reason: 'unconfigured',
            whatsapp: sanitizeWhatsApp(db.whatsapp),
          },
          { status: 400 }
        );
      }

      const validation = isValidGatewayUrl(config.baseUrl);
      if (!validation.valid) {
        db.whatsapp.status = 'disconnected';
        return NextResponse.json(
          { ok: false, error: validation.reason, whatsapp: sanitizeWhatsApp(db.whatsapp) },
          { status: 400 }
        );
      }

      try {
        const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15s para suportar cold start

        const res = await fetch(
          `${cleanBaseUrl}/instance/connectionState/${encodeURIComponent(config.instanceName)}`,
          {
            headers: { apikey: config.apiKey },
            signal: controller.signal,
          }
        );

        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const isOpen = data.state === 'open' || data.instance?.state === 'open';
          const isClosed = data.state === 'close' || data.instance?.state === 'close' || data.state === 'closed';

          if (isOpen) {
            db.whatsapp.status = 'connected';
            db.whatsapp.lastVerificationStatus = 'verified';
            db.whatsapp.lastVerificationError = undefined;
            db.whatsapp.lastPingAt = new Date().toISOString();
            db.whatsapp.qrCodeBase64 = undefined;
            if (data.instance?.profileName) {
              db.whatsapp.profileName = data.instance.profileName;
            }
            if (data.instance?.owner) {
              db.whatsapp.phoneNumber = data.instance.owner.replace('@s.whatsapp.net', '');
            }
          } else if (isClosed) {
            // Só grava disconnected quando o gateway responder validamente que a instância está fechada
            db.whatsapp.status = 'disconnected';
            db.whatsapp.lastVerificationStatus = 'verified';
            db.whatsapp.lastVerificationError = undefined;
          } else {
            db.whatsapp.status = 'connecting';
            db.whatsapp.lastVerificationStatus = 'verified';
            db.whatsapp.lastVerificationError = undefined;
            db.whatsapp.lastPingAt = new Date().toISOString();
          }

          db.whatsapp.updatedAt = new Date().toISOString();
          writeDatabase(db);

          return NextResponse.json({ ok: true, whatsapp: sanitizeWhatsApp(db.whatsapp) });
        } else {
          const errBody = await res.text().catch(() => '');
          const diag = diagnoseEvolutionError(res.status, errBody, null, config.instanceName);

          const isTemporary = diag.reason === 'timeout' || diag.reason === 'unavailable' || res.status >= 500;
          if (isTemporary) {
            db.whatsapp.lastVerificationStatus = diag.reason === 'timeout' ? 'timeout' : 'unreachable';
            db.whatsapp.lastVerificationError = diag.message;
            // Preserva status anterior e lastPingAt!
          } else {
            db.whatsapp.status = 'disconnected';
            db.whatsapp.lastVerificationStatus = 'failed';
            db.whatsapp.lastVerificationError = diag.message;
          }

          db.whatsapp.updatedAt = new Date().toISOString();
          writeDatabase(db);

          return NextResponse.json(
            {
              ok: false,
              error: isTemporary ? 'Não foi possível verificar agora' : diag.message,
              detail: diag.message,
              reason: diag.reason,
              verificationStatus: db.whatsapp.lastVerificationStatus,
              whatsapp: sanitizeWhatsApp(db.whatsapp, {
                verificationStatus: db.whatsapp.lastVerificationStatus,
                verificationMessage: isTemporary ? 'Não foi possível verificar agora' : diag.message,
              }),
            },
            { status: diag.statusCode }
          );
        }
      } catch (fetchErr: unknown) {
        const diag = diagnoseEvolutionError(null, '', fetchErr, config.instanceName);

        const isTemporary = diag.reason === 'timeout' || diag.reason === 'unavailable' || diag.reason === 'network_error';
        if (isTemporary) {
          db.whatsapp.lastVerificationStatus = diag.reason === 'timeout' ? 'timeout' : 'unreachable';
          db.whatsapp.lastVerificationError = diag.message;
          // Preserva status anterior e lastPingAt!
        } else {
          db.whatsapp.status = 'disconnected';
          db.whatsapp.lastVerificationStatus = 'failed';
          db.whatsapp.lastVerificationError = diag.message;
        }

        db.whatsapp.updatedAt = new Date().toISOString();
        writeDatabase(db);

        return NextResponse.json(
          {
            ok: false,
            error: isTemporary ? 'Não foi possível verificar agora' : diag.message,
            detail: diag.message,
            reason: diag.reason,
            verificationStatus: db.whatsapp.lastVerificationStatus,
            whatsapp: sanitizeWhatsApp(db.whatsapp, {
              verificationStatus: db.whatsapp.lastVerificationStatus,
              verificationMessage: isTemporary ? 'Não foi possível verificar agora' : diag.message,
            }),
          },
          { status: diag.statusCode }
        );
      }
    }

    db.whatsapp.updatedAt = new Date().toISOString();
    writeDatabase(db);

    return NextResponse.json({ ok: true, whatsapp: sanitizeWhatsApp(db.whatsapp) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
