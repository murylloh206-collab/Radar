import { DatabaseSchema, readDatabase, writeDatabase, savePublicationJob } from './storage';
import { PublicationJob } from '../types';

export interface QuarantineReport {
  quarantinedJobsCount: number;
  quarantinedReasons: { id: string; reason: string; targetJid: string }[];
  pausedRulesCount: number;
}

/**
 * Aplica a quarentena reversível em trabalhos antigos, de demonstração ou fictícios.
 * Impede que o worker execute sobre dados contaminados.
 * NUNCA apaga dados em massa; altera o status para 'quarentena' com o motivo registrado.
 */
export function applyReversibleQuarantine(customDb?: DatabaseSchema): QuarantineReport {
  const db = customDb || readDatabase();
  let quarantinedJobsCount = 0;
  const quarantinedReasons: { id: string; reason: string; targetJid: string }[] = [];

  const now = new Date().toISOString();

  // 1. Quarentena de trabalhos na fila
  (db.jobs || []).forEach((job: PublicationJob) => {
    // Apenas trabalhos pendentes ou agendados precisam de quarentena
    if (job.status !== 'agendado' && job.status !== 'aguardando_aprovacao' && job.status !== 'rascunho') {
      return;
    }

    const lowerTarget = (job.targetJid || '').toLowerCase();
    const isFictitiousTarget =
      lowerTarget.includes('55555555') ||
      lowerTarget.includes('88888888') ||
      lowerTarget.includes('123456789') ||
      lowerTarget.includes('demo') ||
      lowerTarget.includes('fake');

    const isZeroPrice =
      job.messageText?.includes('R$ 0,00') ||
      job.messageText?.includes('R$ 0.00') ||
      job.messageText?.includes('Por apenas R$ 0');

    const isExampleLink =
      (job.affiliateUrl || '').includes('exemplo.com') ||
      (job.affiliateUrl || '').includes('example.com') ||
      (job.originalUrl || '').includes('exemplo.com');

    const isDemoJob = Boolean(job.isDemo);

    let reason: string | undefined = undefined;

    if (isFictitiousTarget) {
      reason = `Destino fictício de demonstração (${job.targetJid})`;
    } else if (isZeroPrice) {
      reason = 'Preço zerado ou inconsistente (R$ 0,00)';
    } else if (isExampleLink) {
      reason = 'Link exemplificativo sem comprovação de conversão oficial da conta';
    } else if (isDemoJob) {
      reason = 'Trabalho rotulado como demonstração (isDemo)';
    }

    if (reason) {
      job.status = 'quarentena';
      job.quarantineReason = reason;
      job.updatedAt = now;
      quarantinedJobsCount++;
      quarantinedReasons.push({ id: job.id, reason, targetJid: job.targetJid });
    }
  });

  // 2. Pausar regras com destinos fictícios ou nomes de teste
  let pausedRulesCount = 0;
  (db.sources || []).forEach((source) => {
    const hasFictitiousDest = (source.destinations || []).some(
      (d) => d.groupJid.includes('55555555') || d.groupJid.includes('88888888')
    );
    const isTestName =
      source.name.toLowerCase().includes('modo automático') ||
      source.name.toLowerCase().includes('anti loop') ||
      source.name.toLowerCase().includes('teste');

    if ((hasFictitiousDest || isTestName || source.isDemo) && source.isActive) {
      source.isActive = false;
      source.updatedAt = now;
      pausedRulesCount++;
    }
  });

  writeDatabase(db);

  return {
    quarantinedJobsCount,
    quarantinedReasons,
    pausedRulesCount,
  };
}
