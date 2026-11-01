import { PublicationJob } from '../types';
import { readDatabase, writeDatabase, atomicReserveJob, savePublicationJob, getActiveEvolutionConfig, recoverStaleJobs, getWhatsAppConnection } from './storage';
import { processAutomationCampaigns } from './automation-engine';
import { validateJobForDispatch } from './job-validator';

export interface DispatchResult {
  jobId: string;
  success: boolean;
  targetJid: string;
  error?: string;
}

export interface WorkerCycleReport {
  timestamp: string;
  processedCount: number;
  results: DispatchResult[];
  automationJobsCreated?: number;
  skippedReason?: string;
}

function isWithinNightPause(startStr: string, endStr: string): boolean {
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
      // Ex: 22:30 às 07:30 (atravessa meia-noite)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
  } catch {
    return false;
  }
}

/**
 * Envia uma mensagem real via Evolution API
 */
async function sendToEvolutionApi(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  job: PublicationJob
): Promise<{ ok: boolean; error?: string }> {
  if (!baseUrl || !instanceName || !apiKey) {
    return {
      ok: false,
      error: 'Credenciais da Evolution API não configuradas (baseUrl, instanceName e apiKey são obrigatórios).',
    };
  }

  try {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const isValidHttpMedia = Boolean(
      job.mediaUrl && (job.mediaUrl.startsWith('http://') || job.mediaUrl.startsWith('https://'))
    );
    const endpoint = isValidHttpMedia
      ? `${cleanBaseUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`
      : `${cleanBaseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

    const targetRecipient = job.targetJid.includes('@g.us')
      ? job.targetJid
      : job.targetJid.replace('@s.whatsapp.net', '');

    const body = isValidHttpMedia
      ? {
          number: targetRecipient,
          mediatype: job.mediaType === 'video' ? 'video' : 'image',
          media: job.mediaUrl,
          caption: job.messageText,
        }
      : {
          number: targetRecipient,
          text: job.messageText,
        };

    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          // Se o envio de mídia falhar por erro de formato (400), faz fallback imediato para texto
          if (isValidHttpMedia && res.status === 400) {
            const textRes = await fetch(
              `${cleanBaseUrl}/message/sendText/${encodeURIComponent(instanceName)}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: apiKey,
                },
                body: JSON.stringify({
                  number: targetRecipient,
                  text: job.messageText,
                }),
              }
            );
            if (textRes.ok) {
              return { ok: true };
            }
          }
          if (attempt === 1 && (res.status === 502 || res.status === 503 || res.status === 504)) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          return {
            ok: false,
            error: `Evolution API retornou status ${res.status}: ${errText.substring(0, 150)}`,
          };
        }

        return { ok: true };
      } catch (fetchErr: unknown) {
        clearTimeout(timeout);
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw fetchErr;
      }
    }
    return { ok: false, error: 'Falha ao enviar para a Evolution API após retentativa.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Erro de conexão com Evolution API: ${message}`,
    };
  }
}

let isWorkerRunning = false;

/**
 * Executa um ciclo completo do worker:
 * 1. Processa campanhas de automação ativas (Fila, Lista, Curador) gerando novos jobs
 * 2. Reserva atômica dos jobs vencidos no banco (seguro entre múltiplos processos/instâncias)
 * 3. Envio seguro com anti-ban, respeito à pausa noturna e limites diários
 */
export async function runWorkerCycle(): Promise<WorkerCycleReport> {
  const now = new Date();

  // Proteção em memória contra sobreposição no mesmo processo Node
  if (isWorkerRunning) {
    return {
      timestamp: now.toISOString(),
      processedCount: 0,
      results: [],
      skippedReason: 'Ciclo anterior do worker ainda em execução (concorrência bloqueada).',
    };
  }

  isWorkerRunning = true;
  try {
    // 1. Processar campanhas de automação (Fila, Lista, Curador) para gerar trabalhos reais
    let automationReport;
    try {
      automationReport = await processAutomationCampaigns();
    } catch (autoErr) {
      console.error('Erro na avaliação de automação:', autoErr);
    }

    // Recuperar trabalhos abandonados por timeout de processos anteriores (> 5 min)
    recoverStaleJobs();

    const db = readDatabase();
    db.whatsapp.lastWorkerCycleAt = now.toISOString();
    writeDatabase(db);

    // 2. Checar pausa noturna
    if (db.settings.nightPauseEnabled) {
      if (isWithinNightPause(db.settings.nightPauseStart, db.settings.nightPauseEnd)) {
        return {
          timestamp: now.toISOString(),
          processedCount: 0,
          results: [],
          automationJobsCreated: automationReport?.newJobsCreated || 0,
          skippedReason: `Pausa noturna ativa (${db.settings.nightPauseStart} - ${db.settings.nightPauseEnd}). Nenhum disparo executado.`,
        };
      }
    }

    // 3. Checar limite diário de envios
    const todayDateStr = now.toISOString().split('T')[0];
    const sentTodayCount = db.jobs.filter(
      (j) => j.status === 'enviado' && j.sentAt && j.sentAt.startsWith(todayDateStr)
    ).length;

    if (sentTodayCount >= db.settings.maxDailyMessages) {
      return {
        timestamp: now.toISOString(),
        processedCount: 0,
        results: [],
        automationJobsCreated: automationReport?.newJobsCreated || 0,
        skippedReason: `Limite diário de ${db.settings.maxDailyMessages} mensagens atingido (${sentTodayCount} enviadas hoje).`,
      };
    }

    // 4. Localizar jobs prontos para envio (status = 'agendado' e scheduledFor <= now)
    const pendingJobs = db.jobs.filter((j) => {
      if (j.status !== 'agendado') return false;
      if (j.isDemo) return false; // NUNCA envia dados de demonstração ou teste
      if (j.targetJid.includes('55555555') || j.targetJid.includes('88888888')) return false;

      // Se o trabalho pertence a uma regra de cópia que foi pausada pelo usuário, suspende o envio
      if (j.originType === 'copiador' && j.sourceId) {
        const source = db.sources.find((s) => s.id === j.sourceId);
        if (source && !source.isActive) {
          return false;
        }
      }

      const sched = new Date(j.scheduledFor).getTime();
      return sched <= now.getTime();
    });

    if (pendingJobs.length === 0) {
      return {
        timestamp: now.toISOString(),
        processedCount: 0,
        results: [],
        automationJobsCreated: automationReport?.newJobsCreated || 0,
      };
    }

    const results: DispatchResult[] = [];
    // Processar até 3 jobs por ciclo para respeitar throttle e anti-ban
    const jobsToProcess = pendingJobs.slice(0, 3);

    for (const job of jobsToProcess) {
      // RESERVA ATÔMICA NO BANCO:
      // Se houver dois processos ou instâncias rodando simultaneamente,
      // apenas um consegue fazer o lock atômico 'agendado' -> 'enviando'.
      const reserved = await atomicReserveJob(job.id);
      if (!reserved) {
        // Já reservado por outro processo concorrente
        continue;
      }

      // REGRA ESTRITA: Validação no servidor antes de qualquer envio ao WhatsApp.
      // Origem e destino válidos, grupo permitido, oferta real, link próprio confirmado e ausência de dados de demonstração.
      const validation = validateJobForDispatch(job, db);
      if (!validation.valid) {
        job.status = 'falha';
        job.errorDetails = `Bloqueado pelo servidor: ${validation.error}`;
        job.updatedAt = new Date().toISOString();
        await savePublicationJob(job);

        results.push({
          jobId: job.id,
          success: false,
          targetJid: job.targetJid,
          error: validation.error,
        });
        continue;
      }

      job.status = 'enviando';
      job.attempts = (job.attempts || 0) + 1;
      job.updatedAt = new Date().toISOString();

      const defaultEvo = getActiveEvolutionConfig(db.whatsapp);
      const jobConn = getWhatsAppConnection(job.connectionId, job.userId);
      const targetBaseUrl = jobConn?.baseUrl || defaultEvo.baseUrl;
      const targetApiKey = jobConn?.apiKey || defaultEvo.apiKey;
      const targetInstance = jobConn?.instanceName || defaultEvo.instanceName;

      const sendRes = await sendToEvolutionApi(
        targetBaseUrl,
        targetApiKey,
        targetInstance,
        job
      );

      if (sendRes.ok) {
        job.status = 'enviado';
        job.sentAt = new Date().toISOString();
        job.errorDetails = undefined;
        results.push({
          jobId: job.id,
          success: true,
          targetJid: job.targetJid,
        });
      } else {
        job.errorDetails = sendRes.error;
        if (job.attempts >= job.maxAttempts) {
          job.status = 'falha';
        } else {
          job.status = 'agendado';
          // Reagendar com retry backoff de 5 minutos
          job.scheduledFor = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        }

        results.push({
          jobId: job.id,
          success: false,
          targetJid: job.targetJid,
          error: sendRes.error,
        });
      }

      job.updatedAt = new Date().toISOString();
      await savePublicationJob(job);

      // Intervalo de segurança anti-ban entre envios consecutivos
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    return {
      timestamp: now.toISOString(),
      processedCount: results.length,
      results,
      automationJobsCreated: automationReport?.newJobsCreated || 0,
    };
  } finally {
    isWorkerRunning = false;
  }
}
