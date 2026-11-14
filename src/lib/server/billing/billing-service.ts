import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  memoryBillingRepo,
  type AccessGrant,
  type BillingDeps,
  type BillingEnv,
  type BillingRepo,
  type BillingSubscriptionRow,
  type MpApi,
  BillingError,
} from './billing-core';

/** Configuração por ambiente. O token nunca sai do servidor nem aparece em logs/respostas. */
export function billingConfig() {
  const env: BillingEnv = process.env.MERCADOPAGO_ENV === 'production' ? 'production' : 'test';
  const suffix = env === 'production' ? 'PROD' : 'TEST';
  return {
    env,
    accessToken: (process.env[`MERCADOPAGO_ACCESS_TOKEN_${suffix}`] || '').trim(),
    webhookSecret: (process.env[`MERCADOPAGO_WEBHOOK_SECRET_${suffix}`] || '').trim(),
    testPayerEmail: env === 'test' ? (process.env.MERCADOPAGO_TEST_PAYER_EMAIL || '').trim() || null : null,
    appUrl: (process.env.APP_URL || 'https://painel-de-ofertas.vercel.app').trim(),
    ntfyTopic: (process.env.NTFY_TOPIC || '').trim(),
    ntfyServer: (process.env.NTFY_SERVER || 'https://ntfy.sh').trim().replace(/\/$/, ''),
  };
}

function mercadoPagoApi(token: string): MpApi {
  const call = async (method: string, path: string, body?: any) => {
    if (!token) throw new BillingError('Pagamentos ainda não configurados no servidor.', 503);
    const res = await fetch(`https://api.mercadopago.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = String(data?.message || data?.error || `HTTP ${res.status}`).slice(0, 200);
      throw new BillingError(`Mercado Pago recusou a operação: ${msg}`, res.status >= 500 ? 502 : 400);
    }
    return data;
  };
  return {
    createPreapproval: body => call('POST', '/preapproval', body),
    getPreapproval: id => call('GET', `/preapproval/${encodeURIComponent(id)}`),
    async searchAuthorizedPayments(id) {
      const data = await call('GET', `/authorized_payments/search?preapproval_id=${encodeURIComponent(id)}&limit=100`);
      return Array.isArray(data?.results) ? data.results : [];
    },
    getAuthorizedPayment: id => call('GET', `/authorized_payments/${encodeURIComponent(id)}`),
    getPayment: id => call('GET', `/v1/payments/${encodeURIComponent(id)}`),
    updatePreapproval: (id, body) => call('PUT', `/preapproval/${encodeURIComponent(id)}`, body),
  };
}

const toRow = (r: any): BillingSubscriptionRow => ({
  id: r.id,
  userId: r.user_id,
  environment: r.environment,
  planId: r.plan_id,
  amount: Number(r.amount),
  preapprovalId: r.preapproval_id,
  status: r.status,
  nextPaymentDate: r.next_payment_date,
  paidUntil: r.paid_until,
  lastPaymentStatus: r.last_payment_status,
  cancelledAt: r.cancelled_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const fromPatch = (p: Partial<BillingSubscriptionRow>) => {
  const map: Record<string, string> = {
    userId: 'user_id', environment: 'environment', planId: 'plan_id', amount: 'amount', preapprovalId: 'preapproval_id',
    status: 'status', nextPaymentDate: 'next_payment_date', paidUntil: 'paid_until', lastPaymentStatus: 'last_payment_status',
    cancelledAt: 'cancelled_at', createdAt: 'created_at', updatedAt: 'updated_at', id: 'id',
  };
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => [map[k] || k, v]));
};

function supabaseBillingRepo(): BillingRepo {
  const db = () => {
    if (!isSupabaseConfigured || !supabase) throw new BillingError('Banco não configurado.', 503);
    return supabase;
  };
  const must = (error: any) => { if (error) throw new BillingError(`Falha no banco: ${error.message}`, 500); };
  return {
    async insertSubscription(row) { must((await db().from('billing_subscriptions').insert(fromPatch(row))).error); },
    async updateSubscription(id, patch) { must((await db().from('billing_subscriptions').update(fromPatch(patch)).eq('id', id)).error); },
    async findByPreapprovalId(pid) {
      const { data, error } = await db().from('billing_subscriptions').select('*').eq('preapproval_id', pid).maybeSingle();
      must(error);
      return data ? toRow(data) : null;
    },
    async findByExternalReference(ref) {
      if (!/^[0-9a-f-]{36}$/i.test(ref)) return null;
      const { data, error } = await db().from('billing_subscriptions').select('*').eq('id', ref).maybeSingle();
      must(error);
      return data ? toRow(data) : null;
    },
    async latestForUser(userId, env) {
      const { data, error } = await db().from('billing_subscriptions').select('*').eq('user_id', userId).eq('environment', env).order('created_at', { ascending: false }).limit(1).maybeSingle();
      must(error);
      return data ? toRow(data) : null;
    },
    async listForReconcile(env) {
      const since = new Date(Date.now() - 45 * 86400000).toISOString();
      const { data, error } = await db().from('billing_subscriptions').select('*').eq('environment', env).not('preapproval_id', 'is', null).or(`status.neq.cancelled,updated_at.gte.${since}`).limit(500);
      must(error);
      return (data || []).map(toRow);
    },
    async insertPaymentIfNew(row) {
      const { error } = await db().from('billing_payments').insert({
        mp_payment_id: row.mpPaymentId, subscription_id: row.subscriptionId, authorized_payment_id: row.authorizedPaymentId,
        status: row.status, amount: row.amount, approved_at: row.approvedAt,
      });
      if (!error) return true;
      if (error.code === '23505') return false; // já registrado (notificação repetida)
      throw new BillingError(`Falha ao registrar pagamento: ${error.message}`, 500);
    },
    async listApprovedPayments(sid) {
      const { data, error } = await db().from('billing_payments').select('*').eq('subscription_id', sid).eq('status', 'approved');
      must(error);
      return (data || []).map((p: any) => ({ mpPaymentId: p.mp_payment_id, subscriptionId: p.subscription_id, authorizedPaymentId: p.authorized_payment_id, status: p.status, amount: Number(p.amount), approvedAt: p.approved_at }));
    },
  };
}

/** Libera/atualiza o plano em user_subscriptions (expira_em já inclui a tolerância ou o fim do período). */
async function applyAccessToSubscription(userId: string, g: AccessGrant): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('user_subscriptions').upsert(
    {
      user_id: userId,
      plano: g.planId,
      ciclo: 'mensal',
      status: g.cancelled ? 'canceled' : 'active',
      expira_em: g.accessUntil,
      trial_ate: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new BillingError(`Falha ao liberar o plano: ${error.message}`, 500);
}

/** Aviso de venda no celular (app ntfy). Silencioso se não configurado. */
async function notifySaleNtfy(sale: { planName: string; amount: number; env: BillingEnv }): Promise<void> {
  const cfg = billingConfig();
  if (!cfg.ntfyTopic) return;
  const valor = sale.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  await fetch(`${cfg.ntfyServer}/${encodeURIComponent(cfg.ntfyTopic)}`, {
    method: 'POST',
    headers: {
      Title: sale.env === 'test' ? 'Nova venda (TESTE)' : 'Nova venda!',
      Tags: 'moneybag,tada',
      Priority: 'high',
      Click: `${cfg.appUrl}/assinatura`,
    },
    body: `Plano ${sale.planName}: ${valor}/mês`,
    signal: AbortSignal.timeout(8_000),
  });
}

export function billingDeps(): BillingDeps {
  const cfg = billingConfig();
  return {
    env: cfg.env,
    appUrl: cfg.appUrl,
    payerEmailOverride: cfg.testPayerEmail,
    mp: mercadoPagoApi(cfg.accessToken),
    repo: isSupabaseConfigured ? supabaseBillingRepo() : memoryBillingRepo(),
    applyAccess: applyAccessToSubscription,
    notifySale: notifySaleNtfy,
  };
}
