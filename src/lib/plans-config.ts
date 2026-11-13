/**
 * CONFIGURAÇÃO CENTRAL DE PLANOS, LIMITES, PREÇOS E FUNCIONALIDADES (SaaS Radar de Ofertas)
 * Todos os limites, preços e matrizes de permissão ficam centralizados neste arquivo.
 */

export type PlanId = 'impulse' | 'plus' | 'ultimate';
export type BillingCycle = 'anual' | 'mensal';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

export type PlanFeatureKey =
  | 'copier'
  | 'instagram_pro'
  | 'whatsapp_connection'
  | 'watermark_default'
  | 'whatsapp_basic_metrics'
  | 'ai_caption_generator'
  | 'guided_onboarding'
  | 'watermark_custom'
  | 'panel_branding'
  | 'platform_basic_metrics'
  | 'real_deal_badge'
  | 'public_storefront'
  | 'public_showcase'
  | 'auto_image_cards'
  | 'story_image_cards'
  | 'telegram_posting'
  | 'post_scheduling'
  | 'comparator_search'
  | 'full_store_metrics'
  | 'price_drop_alert'
  | 'what_to_post_today'
  | 'weekly_report'
  | 'opportunity_radar'
  | 'multi_account_team';

export interface PlanPricing {
  monthlyPrice: number; // ex: 59.90
  annualMonthlyInstallment: number; // ex: 47.90 (12x sem juros)
  annualTotalPrice: number; // ex: 574.80
  discountPct: number; // 20%
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  landingSummary: string;
  landingBenefits: string[];
  badge?: string;
  popular?: boolean;
  dailyOfferLimit: number | null; // null = ilimitado
  socialDailyPostLimit: number | null; // Instagram Pro + status do WhatsApp; 0 = sem acesso; null = ilimitado
  trialDays: number;
  pricing: PlanPricing;
  monthlyPrice: number;
  annualMonthlyEquivalent: number;
  annualTotalPrice: number;
  inheritsFrom?: PlanId;
  inheritsLabel?: string;
  inheritsFromLabel?: string;
  highlights: string[];
  features: PlanFeatureKey[];
}

export interface UserSubscriptionRecord {
  userId?: string;
  user_id?: string;
  plano: PlanId;
  effectivePlan?: PlanId;
  ciclo: BillingCycle;
  status: SubscriptionStatus;
  expiraEm?: string | null;
  expira_em?: string | null;
  trialAte?: string | null;
  trial_ate?: string | null;
  isTrialActive?: boolean;
  trialDaysRemaining?: number;
  referralCode?: string;
  referral_code?: string;
  referredBy?: string | null;
  referralDiscountPending?: boolean;
  referralsCount?: number;
  updatedAt?: string;
}

export const SAAS_TRIAL_CONFIG = {
  defaultTrialPlan: 'plus' as PlanId,
  trialDurationDays: 0,
  enabled: false,
  durationDays: 0,
};

export const TRIAL_CONFIG = SAAS_TRIAL_CONFIG;

export const SAAS_REFERRAL_CONFIG = {
  referrerNextMonthDiscountPct: 20,
  referredFirstMonthDiscountPct: 10,
  referrerDiscountPercent: 20,
  description: 'A cada amigo indicado que assinar qualquer plano, você ganha 20% de desconto na sua próxima renovação.',
};

export const REFERRAL_CONFIG = SAAS_REFERRAL_CONFIG;

export const DEFAULT_PLATFORM_WATERMARK = {
  handle: '@radar.ofertas.br1',
  label: 'Radar de Ofertas',
};

export const PLANS_CONFIG: Record<PlanId, PlanDefinition> = {
  impulse: {
    id: 'impulse',
    name: 'Impulse',
    tagline: 'Para quem está começando a automatizar grupos de ofertas no WhatsApp.',
    landingSummary: 'Para organizar seus primeiros fluxos de divulgação.',
    landingBenefits: [
      'Copiador e modelos de mensagem',
      'Imagens originais do anúncio',
      'Agendamento e histórico de envios',
      'Métricas básicas do WhatsApp',
    ],
    dailyOfferLimit: 20,
    socialDailyPostLimit: 0,
    trialDays: 0,
    pricing: {
      monthlyPrice: 29.9,
      annualMonthlyInstallment: 23.9,
      annualTotalPrice: 286.8,
      discountPct: 20,
    },
    monthlyPrice: 29.9,
    annualMonthlyEquivalent: 23.9,
    annualTotalPrice: 286.8,
    highlights: [
      'Até 20 ofertas postadas por dia',
      'Copiador automático de grupos WhatsApp',
      'Conexão WhatsApp em tempo real',
      'Imagens originais do anúncio',
      'Métricas básicas do WhatsApp (cliques e postagens 7 dias)',
      'Gerador de legenda com IA (WhatsApp, Instagram e Telegram)',
      'Onboarding guiado passo a passo',
      'Envio seguro no WhatsApp (intervalos e limites configuráveis)',
    ],
    features: [
      'copier',
      'whatsapp_connection',
      'watermark_default',
      'whatsapp_basic_metrics',
      'ai_caption_generator',
      'guided_onboarding',
    ],
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    tagline: 'Para criadores e afiliados que querem identidade própria, agendamento e mais escala.',
    landingSummary: 'Para divulgar com uma identidade que é sua.',
    landingBenefits: [
      'Tudo do Impulse',
      'Marca d’água com sua logo e seu @',
      'Cores e identidade do painel',
      'Cards para feed, story e vitrine',
      'Métricas básicas de cliques',
    ],
    badge: 'Mais popular',
    popular: true,
    dailyOfferLimit: 100,
    socialDailyPostLimit: 5,
    trialDays: 0,
    pricing: {
      monthlyPrice: 59.9,
      annualMonthlyInstallment: 47.9,
      annualTotalPrice: 574.8,
      discountPct: 20,
    },
    monthlyPrice: 59.9,
    annualMonthlyEquivalent: 47.9,
    annualTotalPrice: 574.8,
    inheritsFrom: 'impulse',
    inheritsLabel: 'Tudo do Impulse, mais:',
    inheritsFromLabel: 'Tudo do Impulse, mais:',
    highlights: [
      'Até 100 ofertas postadas por dia',
      'Marca d’água 100% personalizável (sua logo, @, posição e opacidade)',
      'Personalização do painel (nome, logo e cor de destaque)',
      'Métricas básicas da plataforma + WhatsApp',
      'Selo de promoção real ("Menor preço dos últimos 30 dias")',
      'Vitrine pública "Link na Bio" (/@seunome)',
      'Cards de imagem automáticos (Feed e Story 9:16)',
      'Postagem e agendamento oficial no Telegram',
      'Agendamento de postagens com fila inteligente',
    ],
    features: [
      'copier',
      'whatsapp_connection',
      'watermark_default',
      'whatsapp_basic_metrics',
      'ai_caption_generator',
      'guided_onboarding',
      'watermark_custom',
      'panel_branding',
      'platform_basic_metrics',
      'real_deal_badge',
      'public_storefront',
      'public_showcase',
      'auto_image_cards',
      'story_image_cards',
      'instagram_pro',
      'telegram_posting',
      'post_scheduling',
    ],
  },
  ultimate: {
    id: 'ultimate',
    name: 'Ultimate',
    tagline: 'Operação profissional ilimitada com buscador comparador, inteligência de vendas e equipe.',
    landingSummary: 'Para explorar oportunidades e acompanhar resultados.',
    landingBenefits: [
      'Tudo do Plus',
      'Buscador e comparador de ofertas',
      'Alertas de queda de preço',
      'Métricas por loja e visão consolidada',
      'Vendas informadas pelas integrações',
    ],
    dailyOfferLimit: null, // Ilimitado
    socialDailyPostLimit: null, // Ilimitado (respeitando o teto do próprio Instagram)
    trialDays: 0,
    pricing: {
      monthlyPrice: 119.9,
      annualMonthlyInstallment: 95.9,
      annualTotalPrice: 1150.8,
      discountPct: 20,
    },
    monthlyPrice: 119.9,
    annualMonthlyEquivalent: 95.9,
    annualTotalPrice: 1150.8,
    inheritsFrom: 'plus',
    inheritsLabel: 'Tudo do Plus, mais:',
    inheritsFromLabel: 'Tudo do Plus, mais:',
    highlights: [
      'Ofertas postadas por dia ilimitadas',
      'Buscador comparador multi-lojas tolerante a erros de digitação',
      'Métricas completas por loja (cliques, vendas convertidas e gráficos)',
      'Alerta automático de queda de preço por produto',
      ' Inteligência "O que postar hoje" (melhores categorias e horários)',
      'Relatório semanal automático por WhatsApp ou e-mail',
      'Radar de oportunidades (quedas bruscas e ofertas relâmpago)',
      'Múltiplas contas e equipe (permissões de dono e colaborador)',
    ],
    features: [
      'copier',
      'whatsapp_connection',
      'watermark_default',
      'whatsapp_basic_metrics',
      'ai_caption_generator',
      'guided_onboarding',
      'watermark_custom',
      'panel_branding',
      'platform_basic_metrics',
      'real_deal_badge',
      'public_storefront',
      'public_showcase',
      'auto_image_cards',
      'story_image_cards',
      'instagram_pro',
      'telegram_posting',
      'post_scheduling',
      'comparator_search',
      'full_store_metrics',
      'price_drop_alert',
      'what_to_post_today',
      'weekly_report',
      'opportunity_radar',
      'multi_account_team',
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ['impulse', 'plus', 'ultimate'];
export const PLANS_ORDER: PlanId[] = PLAN_ORDER;

export const FEATURE_METADATA: Record<
  PlanFeatureKey,
  { label: string; minPlan: PlanId; description: string }
> = {
  copier: {
    label: 'Copiador de Grupos',
    minPlan: 'impulse',
    description: 'Captura e conversão automática de links em grupos do WhatsApp.',
  },
  whatsapp_connection: {
    label: 'Conexão WhatsApp',
    minPlan: 'impulse',
    description: 'Pareamento oficial via QR Code com disparo em grupos.',
  },
  watermark_default: {
    label: 'Marca d’água Padrão',
    minPlan: 'impulse',
    description: 'Aplicação automática da marca oficial da plataforma nas fotos.',
  },
  whatsapp_basic_metrics: {
    label: 'Métricas Básicas do WhatsApp',
    minPlan: 'impulse',
    description: 'Total de cliques, ofertas postadas e desempenho dos últimos 7 dias.',
  },
  ai_caption_generator: {
    label: 'Gerador de Legenda com IA',
    minPlan: 'impulse',
    description: 'Criação de textos persuasivos por tom e canal.',
  },
  guided_onboarding: {
    label: 'Onboarding Guiado',
    minPlan: 'impulse',
    description: 'Checklist passo a passo para configurar sua operação.',
  },
  watermark_custom: {
    label: 'Marca d’água Personalizável',
    minPlan: 'plus',
    description: 'Envie sua própria logo, defina seu @, ajuste tamanho, opacidade e posição livre.',
  },
  panel_branding: {
    label: 'Personalização do Painel',
    minPlan: 'plus',
    description: 'Personalize nome, logotipo e cor de destaque do seu painel e vitrine.',
  },
  platform_basic_metrics: {
    label: 'Métricas Básicas da Plataforma',
    minPlan: 'plus',
    description: 'Visão consolidada de cliques e publicações em todos os canais.',
  },
  real_deal_badge: {
    label: 'Selo de Promoção Real',
    minPlan: 'plus',
    description: 'Auditoria histórica de 30 dias que destaca o menor preço do mês e alerta falsos descontos.',
  },
  public_storefront: {
    label: 'Vitrine Pública (Link na Bio)',
    minPlan: 'plus',
    description: 'Página pública /@seunome com suas cores, logo e ofertas do dia.',
  },
  public_showcase: {
    label: 'Vitrine Pública (Link na Bio)',
    minPlan: 'plus',
    description: 'Página pública /@seunome com suas cores, logo e ofertas do dia.',
  },
  auto_image_cards: {
    label: 'Cards de Imagem Automáticos',
    minPlan: 'plus',
    description: 'Geração de artes prontas para Feed e Story 9:16 com preço, cupom e marca d’água.',
  },
  story_image_cards: {
    label: 'Cards de Imagem Automáticos',
    minPlan: 'plus',
    description: 'Geração de artes prontas para Feed e Story 9:16 com preço, cupom e marca d’água.',
  },
  telegram_posting: {
    label: 'Postagem no Telegram',
    minPlan: 'plus',
    description: 'Disparo e agendamento de ofertas em canais e grupos do Telegram via Bot API.',
  },
  post_scheduling: {
    label: 'Agendamento de Postagens',
    minPlan: 'plus',
    description: 'Fila programada com controle de horário e status de entrega.',
  },
  comparator_search: {
    label: 'Buscador Comparador Multi-Lojas',
    minPlan: 'ultimate',
    description: 'Busca inteligente tolerante a erros de digitação com comparação lado a lado entre lojas.',
  },
  full_store_metrics: {
    label: 'Métricas Completas por Loja',
    minPlan: 'ultimate',
    description: 'Cliques, vendas convertidas, ticket médio e gráficos detalhados por loja e período.',
  },
  instagram_pro: {
    label: 'Instagram Pro',
    minPlan: 'plus',
    description: 'Artes com a sua marca para story, feed e status do WhatsApp, com link pela bio e postagem automática com freio.',
  },
  price_drop_alert: {
    label: 'Alerta de Queda de Preço',
    minPlan: 'ultimate',
    description: 'Monitoramento automático de produtos com aviso quando o preço atingir sua meta.',
  },
  what_to_post_today: {
    label: 'Inteligência "O que postar hoje"',
    minPlan: 'ultimate',
    description: 'Recomendações diárias de categorias, produtos e melhores horários com base nas suas conversões.',
  },
  weekly_report: {
    label: 'Relatório Semanal Automático',
    minPlan: 'ultimate',
    description: 'Resumo executivo enviado por WhatsApp ou e-mail com comparativo da semana anterior.',
  },
  opportunity_radar: {
    label: 'Radar de Oportunidades',
    minPlan: 'ultimate',
    description: 'Detecção automática de quedas bruscas de preço e ofertas relâmpago.',
  },
  multi_account_team: {
    label: 'Múltiplas Contas e Equipe',
    minPlan: 'ultimate',
    description: 'Gerencie múltiplos canais e convide colaboradores com permissões dedicadas.',
  },
};

export function planHasFeature(planId: PlanId, feature: PlanFeatureKey): boolean {
  const plan = PLANS_CONFIG[planId] || PLANS_CONFIG.impulse;
  return plan.features.includes(feature);
}

export const isFeatureAllowedInPlan = planHasFeature;

export function getRequiredPlanForFeature(feature: PlanFeatureKey): PlanDefinition {
  const meta = FEATURE_METADATA[feature];
  return PLANS_CONFIG[meta?.minPlan || 'ultimate'];
}

export function getMinimumPlanForFeature(feature: PlanFeatureKey): PlanId {
  const meta = FEATURE_METADATA[feature];
  return meta?.minPlan || 'ultimate';
}

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface CheckoutSessionPayload {
  planId: PlanId;
  billingCycle: BillingCycle;
  referralCode?: string;
  startTrial?: boolean;
}

export interface CheckoutSessionResult {
  ok: boolean;
  mode: 'coming_soon' | 'redirect';
  checkoutUrl?: string;
  summary: {
    planName: string;
    billingCycle: BillingCycle;
    displayPrice: string;
    totalAnnual?: string;
    trialDays: number;
    referralApplied: boolean;
  };
  message: string;
}

/**
 * Função única de checkout pronta para conectar ao gateway de pagamento (Stripe / Asaas / Mercado Pago).
 */
export async function startCheckoutSession(
  payload: CheckoutSessionPayload
): Promise<CheckoutSessionResult> {
  const plan = PLANS_CONFIG[payload.planId] || PLANS_CONFIG.plus;
  const isAnnual = payload.billingCycle === 'anual';
  const displayPrice = isAnnual
    ? `12x R$ ${formatCurrencyBRL(plan.pricing.annualMonthlyInstallment)}/mês`
    : `R$ ${formatCurrencyBRL(plan.pricing.monthlyPrice)}/mês`;

  return {
    ok: true,
    mode: 'coming_soon',
    summary: {
      planName: plan.name,
      billingCycle: payload.billingCycle,
      displayPrice,
      totalAnnual: isAnnual ? `R$ ${formatCurrencyBRL(plan.pricing.annualTotalPrice)}` : undefined,
      trialDays: payload.startTrial ? plan.trialDays : 0,
      referralApplied: Boolean(payload.referralCode && payload.referralCode.trim().length >= 4),
    },
    message:
      'A estrutura da sua assinatura já foi preparada! A integração com o gateway de pagamento será liberada em breve.',
  };
}
