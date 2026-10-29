import { NextRequest, NextResponse } from 'next/server';
import { PublicationJob } from '@/lib/types';
import { readDatabase, writeDatabase, ensureValidUuid, savePublicationJob } from '@/lib/server/storage';
import { getSessionFromRequest } from '@/lib/server/auth';
import { validateJobForDispatch } from '@/lib/server/job-validator';
import { runWorkerCycle } from '@/lib/server/worker-engine';

export async function GET(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Acesso não autorizado. Sessão de administrador obrigatória.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const db = readDatabase();
    let list = [...db.jobs];

    if (status) {
      list = list.filter((j) => j.status === status);
    }

    return NextResponse.json({
      ok: true,
      jobs: list,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Acesso não autorizado. Sessão de administrador obrigatória.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action, jobId, jobData } = body;
    const db = readDatabase();

    if (action === 'create') {
      if (!jobData || !jobData.targetJid || !jobData.messageText) {
        return NextResponse.json(
          { ok: false, error: 'Dados insuficientes para criação do trabalho (targetJid e messageText são obrigatórios).' },
          { status: 400 }
        );
      }

      const newJob: PublicationJob = {
        id: ensureValidUuid(),
        userId: db.settings.userId || session.userId,
        originType: jobData.originType || 'manual',
        targetJid: jobData.targetJid,
        targetName: jobData.targetName,
        messageText: jobData.messageText,
        mediaUrl: jobData.mediaUrl,
        mediaType: jobData.mediaType || 'none',
        affiliateUrl: jobData.affiliateUrl || '',
        status: jobData.scheduledFor ? 'agendado' : 'aguardando_aprovacao',
        scheduledFor: jobData.scheduledFor || new Date().toISOString(),
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Validação rigorosa no servidor antes de agendar qualquer trabalho criado diretamente via API
      if (newJob.status === 'agendado') {
        const validation = validateJobForDispatch(newJob, db);
        if (!validation.valid) {
          return NextResponse.json(
            { ok: false, error: `Não é permitido agendar trabalho inválido: ${validation.error}` },
            { status: 400 }
          );
        }
      }

      db.jobs.unshift(newJob);
      writeDatabase(db);

      return NextResponse.json({ ok: true, job: newJob });
    }

    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'jobId é obrigatório' }, { status: 400 });
    }

    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job não encontrado' }, { status: 404 });
    }

    if (action === 'approve' || action === 'send_now') {
      // REGRA ESTRITA: Validação no servidor antes de aprovar ou agendar para envio imediato.
      // Um trabalho antigo, de demonstração ou com link original NÃO PODE ser aprovado.
      const validation = validateJobForDispatch(job, db);
      if (!validation.valid) {
        return NextResponse.json(
          {
            ok: false,
            error: `Aprovação recusada pelo servidor: ${validation.error}`,
          },
          { status: 400 }
        );
      }

      job.status = 'agendado';
      job.scheduledFor = new Date(Date.now() - 1000).toISOString();
      job.updatedAt = new Date().toISOString();
      await savePublicationJob(job);

      const workerReport = await runWorkerCycle();
      const updatedDb = readDatabase();
      const finalJob = updatedDb.jobs.find((j) => j.id === jobId) || job;
      const dispatchRes = workerReport.results.find((r) => r.jobId === jobId);

      if (dispatchRes && !dispatchRes.success) {
        return NextResponse.json(
          {
            ok: false,
            error: `Falha ao enviar para o WhatsApp: ${dispatchRes.error}`,
            job: finalJob,
            workerReport,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({ ok: true, job: finalJob, workerReport });
    } else if (action === 'cancel') {
      job.status = 'cancelado';
      job.updatedAt = new Date().toISOString();
      await savePublicationJob(job);
    } else if (action === 'unquarantine') {
      // Reverter da quarentena para revisão manual do usuário
      job.status = 'aguardando_aprovacao';
      job.errorDetails = undefined;
      job.updatedAt = new Date().toISOString();
      await savePublicationJob(job);
    } else if (action === 'retry') {
      const validation = validateJobForDispatch(job, db);
      if (!validation.valid) {
        return NextResponse.json(
          {
            ok: false,
            error: `Tentativa de reenvio recusada: ${validation.error}`,
          },
          { status: 400 }
        );
      }

      job.status = 'agendado';
      job.attempts = 0;
      job.errorDetails = undefined;
      job.scheduledFor = new Date(Date.now() - 1000).toISOString();
      job.updatedAt = new Date().toISOString();
      await savePublicationJob(job);

      const workerReport = await runWorkerCycle();
      const updatedDb = readDatabase();
      const finalJob = updatedDb.jobs.find((j) => j.id === jobId) || job;
      return NextResponse.json({ ok: true, job: finalJob, workerReport });
    } else {
      return NextResponse.json({ ok: false, error: 'Ação desconhecida' }, { status: 400 });
    }

    writeDatabase(db);
    return NextResponse.json({ ok: true, job });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
