import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { scopedCopierRules } from '@/lib/server/copier-scoped-rules';
import { copierActivity } from '@/lib/server/copier-activity';
import { savedWhatsAppGroups } from '@/lib/server/whatsapp-group-cache';
import { connectionView } from '@/lib/server/whatsapp-state';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false }, { status: 401, headers });
  try {
    const id = req.nextUrl.searchParams.get('connectionId') || undefined;
    const [rules, catalog] = await Promise.all([scopedCopierRules(session, id), savedWhatsAppGroups(session, id)]);
    const activity = await copierActivity(session.userId, rules.connection.id);
    const source = rules.sources.find(rule => rule.isActive) || rules.sources[0];
    const names = new Map(catalog.groups.map(group => [group.groupJid, group.name]));
    const destinations = rules.destinations.filter(destination => destination.sourceId === source?.id && destination.isActive);
    const lastEvent = activity.inbox[0];
    const sent = activity.jobs.find(job => job.status === 'enviado');
    const workerReason = activity.workerActive ? undefined : 'O processador de mensagens está parado. As mensagens recebidas estão salvas na fila.';
    const summary = { hasRule: !!source, ruleId: source?.id, originJid: source?.groupJid,
      originName: source ? names.get(source.groupJid) || source.name : 'Escolha a origem',
      destinationNames: destinations.map(destination => names.get(destination.groupJid) || destination.name),
      destinationJids: destinations.map(destination => destination.groupJid), operationMode: source?.operationMode || 'revisao_manual',
      isActive: !!source?.isActive, state: !source?.isActive ? 'pausado' : !activity.workerActive ? 'erro' : 'ativo',
      stateLabel: !source?.isActive ? 'Pausado' : !activity.workerActive ? 'Processador parado' : 'Monitorando', blockReason: workerReason };
    return NextResponse.json({ ok: true, summary, activeConnection: connectionView(rules.connection),
      connections: catalog.connections.map(connectionView), workerConfigured: activity.workerActive, workerReason,
      receiving: { status: lastEvent ? 'ativo' : 'aguardando', lastMessageReceivedAt: lastEvent?.received_at || null,
        todayCount: activity.receivedToday, totalCount: activity.inbox.length },
      queue: { status: !activity.workerActive ? 'parada' : activity.pendingEvents || activity.scheduledCount ? 'processando' : 'ociosa',
        isWorkerActive: activity.workerActive, lastProcessedAt: sent?.sent_at || null, scheduledCount: activity.scheduledCount,
        pendingReviewCount: activity.reviewCount, sentTodayCount: activity.sentToday, failedCount: activity.failedCount,
        nextSendAt: activity.jobs.find(job => job.status === 'agendado')?.scheduled_for || null },
      activity: [
        ...activity.inbox.map(entry => ({ id: entry.id, type: 'recebimento', timestamp: entry.received_at,
          title: 'Mensagem recebida', detail: entry.result?.reason || 'Mensagem salva para processamento',
          status: entry.status, reason: entry.last_error || entry.result?.reason, groupName: names.get(entry.remoteJid) || 'Grupo de origem' })),
        ...activity.jobs.map(job => ({ id: job.id, type: 'envio', timestamp: job.sent_at || job.updated_at,
          title: 'Publicação', detail: job.error_details || job.status, status: job.status,
          reason: job.error_details, groupName: job.target_name || 'Grupo de destino' })),
      ].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)).slice(0, 50) }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: 'Não foi possível consultar a regra e o processamento salvos.' }, { status: 503, headers });
  }
}
