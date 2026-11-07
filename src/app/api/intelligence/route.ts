import { NextRequest, NextResponse } from 'next/server';
import {
  checkPlanFeatureAccess,
  getUserSubscription,
  resolveCurrentUserId,
} from '@/lib/server/plan-guard';
import { planHasFeature, type PlanFeatureKey } from '@/lib/plans-config';
import { readDatabase } from '@/lib/server/storage';
import {
  createPriceDropAlert,
  decideRadarReviewJob,
  deletePriceDropAlert,
  evaluateAndTriggerPriceDropAlerts,
  generateAndSendWeeklyReport,
  getBackgroundJobsStatus,
  getIntelligenceSettings,
  getWhatToPostTodayRecommendations,
  listPriceDropAlerts,
  listTeamAndChannels,
  removeTeamMember,
  removeWorkspaceChannel,
  runOpportunityRadarScan,
  runUnifiedBackgroundCycle,
  saveIntelligenceSettings,
  upsertTeamMember,
  upsertWorkspaceChannel,
  type AlertNotifyChannel,
  type BackgroundJobKey,
} from '@/lib/server/intelligence-hub';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const sub = await getUserSubscription(userId);
    const plan = sub.effectivePlan;
    const isUltimate =
      planHasFeature(plan, 'price_drop_alert') &&
      planHasFeature(plan, 'what_to_post_today') &&
      planHasFeature(plan, 'weekly_report') &&
      planHasFeature(plan, 'opportunity_radar') &&
      planHasFeature(plan, 'multi_account_team');

    const backgroundStatus = await getBackgroundJobsStatus(userId);

    if (!isUltimate) {
      return NextResponse.json({
        ok: true,
        effectivePlan: plan,
        isUltimate: false,
        backgroundStatus,
        lockedMessage:
          'Os recursos de Inteligência (Alerta de Queda de Preço, O que Postar Hoje, Radar de Oportunidades, Relatório Semanal e Equipe) são exclusivos do plano Ultimate.',
      });
    }

    const [
      settings,
      alerts,
      whatToPost,
      weeklyReportPreview,
      teamAndChannels,
    ] = await Promise.all([
      getIntelligenceSettings(userId),
      listPriceDropAlerts(userId),
      getWhatToPostTodayRecommendations(userId),
      generateAndSendWeeklyReport(userId, { dispatchNow: false }),
      listTeamAndChannels(userId),
    ]);

    const db = readDatabase();
    const reviewQueue = (db.jobs || []).filter((j) => j.status === 'aguardando_aprovacao');

    return NextResponse.json({
      ok: true,
      effectivePlan: plan,
      isUltimate: true,
      settings,
      alerts,
      whatToPost,
      weeklyReportPreview,
      reviewQueue,
      team: teamAndChannels.members,
      channels: teamAndChannels.channels,
      backgroundStatus,
      emailEnvConfigured: Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // Execução do motor de segundo plano (permitida para agendamento em Plus/Ultimate)
    if (action === 'run_background_cycle') {
      const targetJob = (body.jobKey || 'all') as BackgroundJobKey | 'all';
      const res = await runUnifiedBackgroundCycle(userId, targetJob);
      return NextResponse.json({
        ...res,
        message: res.summary,
      });
    }

    // Mapeamento de validação de plano no servidor por ação
    const actionFeatureMap: Record<string, PlanFeatureKey> = {
      create_alert: 'price_drop_alert',
      delete_alert: 'price_drop_alert',
      check_alerts: 'price_drop_alert',
      scan_radar: 'opportunity_radar',
      decide_radar_job: 'opportunity_radar',
      save_settings: 'opportunity_radar',
      send_weekly_report: 'weekly_report',
      save_team_member: 'multi_account_team',
      remove_team_member: 'multi_account_team',
      save_workspace_channel: 'multi_account_team',
      remove_workspace_channel: 'multi_account_team',
    };

    const requiredFeature = actionFeatureMap[action] || 'opportunity_radar';
    const access = await checkPlanFeatureAccess(requiredFeature, userId);
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          requiredPlan: access.requiredPlan,
          error:
            access.error ||
            'Este recurso de inteligência e equipe é exclusivo do plano Ultimate.',
        },
        { status: 403 }
      );
    }

    if (action === 'create_alert') {
      const productTitle = String(body.productTitle || '').trim();
      const productUrl = String(body.productUrl || '').trim();
      const currentPrice = Number(body.currentPrice || 0);
      const targetPrice = Number(body.targetPrice || 0);
      const notifyChannel = (['whatsapp', 'telegram', 'both'].includes(body.notifyChannel)
        ? body.notifyChannel
        : 'whatsapp') as AlertNotifyChannel;

      if (!productTitle || !productUrl || targetPrice <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Informe o nome do produto, o link e o valor-meta (R$) para criar o alerta.',
          },
          { status: 400 }
        );
      }

      const alert = await createPriceDropAlert({
        userId,
        productTitle,
        productUrl,
        affiliateUrl: String(body.affiliateUrl || productUrl).trim(),
        store: String(body.store || ''),
        currentPrice: currentPrice > 0 ? currentPrice : targetPrice,
        targetPrice,
        notifyChannel,
      });

      return NextResponse.json({
        ok: true,
        alert,
        message: `Alerta de queda de preço criado para "${alert.productTitle}" (Meta: R$ ${alert.targetPrice.toFixed(2).replace('.', ',')})!`,
      });
    }

    if (action === 'delete_alert') {
      const deleted = await deletePriceDropAlert(userId, String(body.alertId || ''));
      return NextResponse.json({
        ok: deleted,
        message: deleted ? 'Alerta removido com sucesso.' : 'Alerta não encontrado.',
      });
    }

    if (action === 'check_alerts') {
      const overrides =
        body.priceOverrides && typeof body.priceOverrides === 'object'
          ? (body.priceOverrides as Record<string, number>)
          : undefined;
      const result = await evaluateAndTriggerPriceDropAlerts(userId, overrides);
      return NextResponse.json({
        ok: true,
        ...result,
        message:
          result.triggeredCount > 0
            ? `🔔 ${result.triggeredCount} alerta(s) atingiram o preço-meta e foram disparados!`
            : `${result.checkedCount} alerta(s) verificado(s): nenhum atingiu o preço-meta ainda.`,
      });
    }

    if (action === 'scan_radar') {
      const result = await runOpportunityRadarScan(userId, {
        minDropPctOverride:
          body.minDropPct !== undefined ? Number(body.minDropPct) : undefined,
      });
      return NextResponse.json({
        ok: true,
        ...result,
        message:
          result.queuedForReviewCount > 0
            ? `🎯 Radar encontrou ${result.queuedForReviewCount} oportunidade(s) e colocou na Fila de Revisão (aguardando sua aprovação).`
            : `Radar verificou ${result.scannedCount} produto(s): nenhuma nova queda forte além das já listadas na fila de revisão.`,
      });
    }

    if (action === 'decide_radar_job') {
      const jobId = String(body.jobId || '');
      const decision = body.decision === 'approve' ? 'approve' : 'reject';
      const result = await decideRadarReviewJob(jobId, decision);
      return NextResponse.json(result, { status: result.ok ? 200 : 404 });
    }

    if (action === 'save_settings') {
      const updated = await saveIntelligenceSettings(userId, {
        radarEnabled:
          body.radarEnabled !== undefined ? Boolean(body.radarEnabled) : undefined,
        radarMinDropPct:
          body.radarMinDropPct !== undefined ? Number(body.radarMinDropPct) : undefined,
        radarIncludeFlashDeals:
          body.radarIncludeFlashDeals !== undefined
            ? Boolean(body.radarIncludeFlashDeals)
            : undefined,
        weeklyReportEnabled:
          body.weeklyReportEnabled !== undefined
            ? Boolean(body.weeklyReportEnabled)
            : undefined,
        weeklyReportWhatsapp:
          body.weeklyReportWhatsapp !== undefined
            ? Boolean(body.weeklyReportWhatsapp)
            : undefined,
        weeklyReportEmail:
          body.weeklyReportEmail !== undefined
            ? String(body.weeklyReportEmail).trim()
            : undefined,
      });
      return NextResponse.json({
        ok: true,
        settings: updated,
        message: 'Configurações de Inteligência e Radar salvas com sucesso!',
      });
    }

    if (action === 'send_weekly_report') {
      const summary = await generateAndSendWeeklyReport(userId, {
        dispatchNow: true,
        emailOverride: body.email ? String(body.email).trim() : undefined,
      });
      return NextResponse.json({
        ok: true,
        summary,
        message: `Relatório semanal gerado! WhatsApp: ${summary.channelsDispatched.whatsapp.detail} | E-mail: ${summary.channelsDispatched.email.detail}`,
      });
    }

    if (action === 'save_team_member') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const role = body.role === 'dono' ? 'dono' : 'colaborador';
      if (!name || !email) {
        return NextResponse.json(
          { ok: false, error: 'Informe nome e e-mail do membro da equipe.' },
          { status: 400 }
        );
      }
      const member = await upsertTeamMember(userId, {
        id: body.id ? String(body.id) : undefined,
        name,
        email,
        role,
        permissions: body.permissions,
      });
      return NextResponse.json({
        ok: true,
        member,
        message: `Membro "${member.name}" (${member.role.toUpperCase()}) salvo na equipe!`,
      });
    }

    if (action === 'remove_team_member') {
      const removed = await removeTeamMember(userId, String(body.memberId || ''));
      return NextResponse.json({
        ok: removed,
        message: removed
          ? 'Colaborador removido da equipe.'
          : 'Não é permitido remover o titular (Dono) do workspace.',
      });
    }

    if (action === 'save_workspace_channel') {
      const label = String(body.label || '').trim();
      const targetIdentifier = String(body.targetIdentifier || '').trim();
      const channelType = body.channelType === 'telegram' ? 'telegram' : 'whatsapp';
      if (!label || !targetIdentifier) {
        return NextResponse.json(
          { ok: false, error: 'Informe o nome do canal e o identificador (JID ou Chat ID).' },
          { status: 400 }
        );
      }
      const channel = await upsertWorkspaceChannel(userId, {
        id: body.id ? String(body.id) : undefined,
        channelType,
        label,
        targetIdentifier,
        isDefault: Boolean(body.isDefault),
      });
      return NextResponse.json({
        ok: true,
        channel,
        message: `Canal adicional "${channel.label}" (${channel.channelType.toUpperCase()}) cadastrado com sucesso!`,
      });
    }

    if (action === 'remove_workspace_channel') {
      const removed = await removeWorkspaceChannel(userId, String(body.channelId || ''));
      return NextResponse.json({
        ok: removed,
        message: removed ? 'Canal removido.' : 'Canal não encontrado.',
      });
    }

    return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
