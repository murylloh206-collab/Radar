import { NextRequest, NextResponse } from 'next/server';
import {
  getUserSubscription,
  getDailyOfferQuotaStatus,
  setDevTestPlan,
  isDevEnvironment,
  resolveCurrentUserId,
} from '@/lib/server/plan-guard';
import {
  PLANS_CONFIG,
  PlanId,
  BillingCycle,
  startCheckoutSession,
} from '@/lib/plans-config';
import { getDatabase, readDatabase } from '@/lib/server/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface OnboardingStepStatus {
  id: 'whatsapp_connected' | 'affiliate_configured' | 'first_offer_posted' | 'first_click_tracked';
  stepNumber: number;
  title: string;
  description: string;
  completed: boolean;
  actionLabel: string;
  actionHref: string;
}

async function computeOnboardingStatus(userId: string): Promise<{
  steps: OnboardingStepStatus[];
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
}> {
  let db;
  try {
    db = await getDatabase();
  } catch {
    db = readDatabase();
  }

  // 1. Conectar WhatsApp
  const hasConnectedWhatsApp =
    db.whatsapp?.status === 'connected' ||
    (Array.isArray(db.connections) &&
      db.connections.some((c) => c.status === 'connected' || Boolean(c.ownerJid)));

  // 2. Cadastrar ID de afiliado
  const hasAffiliateId =
    Array.isArray(db.stores) &&
    db.stores.some(
      (s) =>
        s.isActive &&
        (Boolean(s.affiliateTag && s.affiliateTag.trim()) ||
          Boolean(s.appId && s.appId.trim()))
    );

  // 3. Postar a primeira oferta
  const hasPostedOffer =
    Array.isArray(db.jobs) &&
    db.jobs.some((j) => j.status === 'enviado' || j.status === 'agendado');

  // 4. Ver o primeiro clique (consulta real na tabela tracked_links / click_events se disponível)
  let hasFirstClick = false;
  if (isSupabaseConfigured && supabase) {
    try {
      const { count } = await supabase
        .from('click_events')
        .select('id', { count: 'exact', head: true });
      if (typeof count === 'number' && count > 0) {
        hasFirstClick = true;
      } else {
        const { data: tracked } = await supabase
          .from('tracked_links')
          .select('clicks_count')
          .eq('user_id', userId)
          .gt('clicks_count', 0)
          .limit(1);
        if (tracked && tracked.length > 0) {
          hasFirstClick = true;
        }
      }
    } catch {
      hasFirstClick = false;
    }
  }

  const steps: OnboardingStepStatus[] = [
    {
      id: 'whatsapp_connected',
      stepNumber: 1,
      title: 'Conectar seu WhatsApp',
      description: 'Escaneie o código QR para o sistema conseguir ler e enviar as ofertas nos seus grupos.',
      completed: Boolean(hasConnectedWhatsApp),
      actionLabel: hasConnectedWhatsApp ? 'WhatsApp conectado' : 'Conectar agora',
      actionHref: '/whatsapp',
    },
    {
      id: 'affiliate_configured',
      stepNumber: 2,
      title: 'Cadastrar seu ID de afiliado',
      description: 'Coloque sua etiqueta do Mercado Livre ou Shopee para ganhar comissão em cada venda.',
      completed: Boolean(hasAffiliateId),
      actionLabel: hasAffiliateId ? 'Afiliado configurado' : 'Cadastrar ID',
      actionHref: '/afiliados',
    },
    {
      id: 'first_offer_posted',
      stepNumber: 3,
      title: 'Postar sua primeira oferta',
      description: 'Copie ou crie uma promoção com seu link de afiliado e envie para o seu grupo.',
      completed: Boolean(hasPostedOffer),
      actionLabel: hasPostedOffer ? 'Oferta já enviada' : 'Postar oferta',
      actionHref: '/copiador',
    },
    {
      id: 'first_click_tracked',
      stepNumber: 4,
      title: 'Ver seu primeiro clique',
      description: 'Acompanhe quando as pessoas clicarem no seu link de oferta compartilhado.',
      completed: Boolean(hasFirstClick),
      actionLabel: hasFirstClick ? 'Cliques registrados' : 'Ver como rastrear',
      actionHref: '/criar-conteudo',
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  return {
    steps,
    completedCount,
    totalCount: steps.length,
    allCompleted: completedCount === steps.length,
  };
}

export async function GET() {
  try {
    const userId = resolveCurrentUserId();
    const [subscription, quota, onboarding] = await Promise.all([
      getUserSubscription(userId),
      getDailyOfferQuotaStatus(userId),
      computeOnboardingStatus(userId),
    ]);

    return NextResponse.json({
      ok: true,
      isDevMode: isDevEnvironment(),
      subscription,
      planDefinition: PLANS_CONFIG[subscription.plano],
      quota,
      onboarding,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const userId = resolveCurrentUserId();

    if (action === 'set_test_plan') {
      // REGRA ESTRITA: O seletor "Plano de teste" SÓ PODE FUNCIONAR EM DESENVOLVIMENTO (NODE_ENV !== 'production')
      if (!isDevEnvironment()) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Operação bloqueada: o seletor de Plano de Teste está desativado em ambiente de produção. Em produção, o plano vem exclusivamente da tabela user_subscriptions.',
          },
          { status: 403 }
        );
      }

      const planId = body.plano as PlanId;
      const ciclo: BillingCycle = body.ciclo === 'mensal' ? 'mensal' : 'anual';

      if (!planId || !['impulse', 'plus', 'ultimate'].includes(planId)) {
        return NextResponse.json(
          { ok: false, error: 'Plano inválido. Escolha impulse, plus ou ultimate.' },
          { status: 400 }
        );
      }

      const updatedSub = await setDevTestPlan(userId, planId, { ciclo });
      const quota = await getDailyOfferQuotaStatus(userId);

      return NextResponse.json({
        ok: true,
        isDevMode: true,
        subscription: updatedSub,
        planDefinition: PLANS_CONFIG[updatedSub.plano],
        quota,
      });
    }

    if (action === 'checkout') {
      const planId = body.planId as PlanId;
      const cycle: BillingCycle = body.cycle === 'mensal' ? 'mensal' : 'anual';

      if (!planId || !['impulse', 'plus', 'ultimate'].includes(planId)) {
        return NextResponse.json(
          { ok: false, error: 'Plano inválido selecionado para checkout.' },
          { status: 400 }
        );
      }

      const checkoutResult = await startCheckoutSession({
        planId,
        billingCycle: cycle,
        referralCode: typeof body.referralCode === 'string' ? body.referralCode : undefined,
      });

      return NextResponse.json({
        ok: true,
        checkout: checkoutResult,
      });
    }

    return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
