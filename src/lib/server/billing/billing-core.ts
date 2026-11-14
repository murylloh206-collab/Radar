import crypto from 'crypto';
import { PLANS_CONFIG, type PlanId } from '@/lib/plans-config';

/*
 * Assinaturas mensais do Mercado Pago (assinatura sem plano associado, criada pelo servidor).
 * Regras do dono:
 *  - libera só com PAGAMENTO APROVADO confirmado no Mercado Pago (autorizada não basta; retorno do navegador não basta);
 *  - acesso = último pagamento aprovado + 1 mês, com 2 dias de tolerância;
 *  - cancelada: acesso até o fim do período pago (sem tolerância);
 *  - aviso de venda uma única vez por pagamento.
 */

export const GRACE_DAYS = 2;
export type BillingEnv = 'test' | 'production';

export class BillingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface MpApi {
  createPreapproval(body: any): Promise<{ id: string; init_point: string; status: string }>;
  getPreapproval(id: string): Promise<any | null>;
  searchAuthorizedPayments(preapprovalId: string): Promise<any[]>;
  getAuthorizedPayment(id: string): Promise<any | null>;
  getPayment(id: string): Promise<any | null>;
  updatePreapproval(id: string, body: any): Promise<any>;
}

export interface BillingSubscriptionRow {
  id: string; // também é o external_reference enviado ao Mercado Pago
  userId: string;
  environment: BillingEnv;
  planId: PlanId;
  amount: number;
  preapprovalId: string | null;
  status: string; // pending | authorized | paused | cancelled
  nextPaymentDate: string | null;
  paidUntil: string | null;
  lastPaymentStatus: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPaymentRow {
  mpPaymentId: string;
  subscriptionId: string;
  authorizedPaymentId: string | null;
  status: string;
  amount: number;
  approvedAt: string;
}

export interface BillingRepo {
  insertSubscription(row: BillingSubscriptionRow): Promise<void>;
  updateSubscription(id: string, patch: Partial<BillingSubscriptionRow>): Promise<void>;
  findByPreapprovalId(preapprovalId: string): Promise<BillingSubscriptionRow | null>;
  findByExternalReference(ref: string): Promise<BillingSubscriptionRow | null>;
  latestForUser(userId: string, env: BillingEnv): Promise<BillingSubscriptionRow | null>;
  listForReconcile(env: BillingEnv): Promise<BillingSubscriptionRow[]>;
  /** true só na primeira vez que o pagamento é registrado (idempotência). */
  insertPaymentIfNew(row: BillingPaymentRow): Promise<boolean>;
  listApprovedPayments(subscriptionId: string): Promise<BillingPaymentRow[]>;
}

export interface AccessGrant {
  planId: PlanId;
  paidUntil: string;
  accessUntil: string;
  cancelled: boolean;
}

export interface BillingDeps {
  env: BillingEnv;
  appUrl: string;
  /** Em teste o Mercado Pago exige o e-mail do comprador de teste. */
  payerEmailOverride?: string | null;
  mp: MpApi;
  repo: BillingRepo;
  applyAccess(userId: string, grant: AccessGrant): Promise<void>;
  notifySale(sale: { planName: string; amount: number; env: BillingEnv }): Promise<void>;
  now?: () => Date;
}

const nowOf = (d: BillingDeps) => (d.now ? d.now() : new Date());
const addMonths = (iso: string, n: number) => {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString();
};
const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * 86400000).toISOString();

export function memoryBillingRepo(): BillingRepo {
  const subs = new Map<string, BillingSubscriptionRow>();
  const pays = new Map<string, BillingPaymentRow>();
  return {
    async insertSubscription(row) { subs.set(row.id, { ...row }); },
    async updateSubscription(id, patch) { const r = subs.get(id); if (r) subs.set(id, { ...r, ...patch }); },
    async findByPreapprovalId(pid) { return [...subs.values()].find(r => r.preapprovalId === pid) || null; },
    async findByExternalReference(ref) { return subs.get(ref) || null; },
    async latestForUser(userId, env) {
      return [...subs.values()].filter(r => r.userId === userId && r.environment === env).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
    },
    async listForReconcile(env) { return [...subs.values()].filter(r => r.environment === env && r.preapprovalId && r.status !== 'cancelled'); },
    async insertPaymentIfNew(row) { if (pays.has(row.mpPaymentId)) return false; pays.set(row.mpPaymentId, { ...row }); return true; },
    async listApprovedPayments(sid) { return [...pays.values()].filter(p => p.subscriptionId === sid && p.status === 'approved'); },
  };
}

export async function startCheckout(
  d: BillingDeps,
  input: { userId: string; email: string; planId: PlanId }
): Promise<{ checkoutUrl: string; subscriptionId: string }> {
  const plan = (PLANS_CONFIG as Record<string, any>)[input.planId];
  if (!plan) throw new BillingError('Plano inválido.');
  const amount = Number(plan.pricing?.monthlyPrice ?? plan.monthlyPrice);
  if (!(amount > 0)) throw new BillingError('Preço do plano indisponível.');
  const payerEmail = (d.env === 'test' && d.payerEmailOverride) || input.email;
  if (!payerEmail) throw new BillingError('Sua conta não tem e-mail para a assinatura.');

  const id = crypto.randomUUID();
  const at = nowOf(d).toISOString();
  await d.repo.insertSubscription({
    id, userId: input.userId, environment: d.env, planId: input.planId, amount, preapprovalId: null,
    status: 'pending', nextPaymentDate: null, paidUntil: null, lastPaymentStatus: null, cancelledAt: null, createdAt: at, updatedAt: at,
  });
  const created = await d.mp.createPreapproval({
    reason: `Radar de Ofertas — plano ${plan.name}`,
    external_reference: id,
    payer_email: payerEmail,
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: amount, currency_id: 'BRL' },
    back_url: `${d.appUrl.replace(/\/$/, '')}/assinatura/retorno`,
    status: 'pending',
  });
  if (!created?.id || !created?.init_point) throw new BillingError('O Mercado Pago não devolveu o link de pagamento.', 502);
  await d.repo.updateSubscription(id, { preapprovalId: String(created.id), status: created.status || 'pending', updatedAt: nowOf(d).toISOString() });
  return { checkoutUrl: created.init_point, subscriptionId: id };
}

/** Lê o estado atual no Mercado Pago e aplica as regras. Repetir é inofensivo. */
export async function syncSubscription(d: BillingDeps, preapprovalId: string): Promise<BillingSubscriptionRow | null> {
  const pre = await d.mp.getPreapproval(preapprovalId);
  if (!pre) return null;
  const row =
    (await d.repo.findByPreapprovalId(String(pre.id))) ||
    (pre.external_reference ? await d.repo.findByExternalReference(String(pre.external_reference)) : null);
  if (!row || row.environment !== d.env) return null; // não é nossa (ou é de outro ambiente)

  const patch: Partial<BillingSubscriptionRow> = {
    preapprovalId: String(pre.id),
    status: String(pre.status || row.status),
    nextPaymentDate: pre.next_payment_date || null,
    updatedAt: nowOf(d).toISOString(),
  };
  if (pre.status === 'cancelled' && !row.cancelledAt) patch.cancelledAt = nowOf(d).toISOString();

  const invoices = await d.mp.searchAuthorizedPayments(String(pre.id));
  let lastStatus: string | null = row.lastPaymentStatus;
  for (const inv of invoices) {
    const payStatus = String(inv?.payment?.status || '');
    if (payStatus) lastStatus = payStatus;
    if (payStatus !== 'approved' || !inv?.payment?.id) continue;
    const isNew = await d.repo.insertPaymentIfNew({
      mpPaymentId: String(inv.payment.id),
      subscriptionId: row.id,
      authorizedPaymentId: inv.id != null ? String(inv.id) : null,
      status: 'approved',
      amount: Number(inv.transaction_amount || row.amount),
      approvedAt: new Date(inv.debit_date || inv.date_created || nowOf(d)).toISOString(),
    });
    if (isNew) {
      const planName = (PLANS_CONFIG as Record<string, any>)[row.planId]?.name || row.planId;
      await d.notifySale({ planName, amount: Number(inv.transaction_amount || row.amount), env: d.env }).catch(() => {});
    }
  }
  patch.lastPaymentStatus = lastStatus;

  const approved = await d.repo.listApprovedPayments(row.id);
  if (approved.length) {
    const lastApproved = approved.map(p => p.approvedAt).sort().pop()!;
    const paidUntil = addMonths(lastApproved, 1);
    const cancelled = (patch.status || row.status) === 'cancelled';
    patch.paidUntil = paidUntil;
    await d.applyAccess(row.userId, {
      planId: row.planId,
      paidUntil,
      accessUntil: cancelled ? paidUntil : addDays(paidUntil, GRACE_DAYS),
      cancelled,
    });
  }
  await d.repo.updateSubscription(row.id, patch);
  return { ...row, ...patch };
}

export async function handleNotification(d: BillingDeps, n: { type: string; dataId: string }): Promise<void> {
  const id = String(n.dataId || '').trim();
  if (!id) return;
  let preapprovalId: string | null = null;
  if (n.type === 'subscription_preapproval') preapprovalId = id;
  else if (n.type === 'subscription_authorized_payment') preapprovalId = (await d.mp.getAuthorizedPayment(id))?.preapproval_id || null;
  else if (n.type === 'payment') {
    const p = await d.mp.getPayment(id);
    preapprovalId = p?.metadata?.preapproval_id || p?.point_of_interaction?.transaction_data?.subscription_id || null;
  }
  if (preapprovalId) await syncSubscription(d, String(preapprovalId));
}

export async function cancelForUser(d: BillingDeps, userId: string): Promise<void> {
  const row = await d.repo.latestForUser(userId, d.env);
  if (!row || !row.preapprovalId || row.status === 'cancelled') throw new BillingError('Você não tem assinatura ativa para cancelar.', 404);
  await d.mp.updatePreapproval(row.preapprovalId, { status: 'cancelled' });
  await syncSubscription(d, row.preapprovalId);
}

export interface BillingStatusView {
  hasSubscription: boolean;
  planId: PlanId | null;
  planName: string | null;
  amount: number | null;
  status: string | null;
  lastPaymentStatus: string | null;
  paidUntil: string | null;
  accessUntil: string | null;
  nextPaymentDate: string | null;
  environment: BillingEnv;
}

export async function getStatusForUser(d: BillingDeps, userId: string, opts: { refresh?: boolean } = {}): Promise<BillingStatusView> {
  let row = await d.repo.latestForUser(userId, d.env);
  if (row?.preapprovalId && opts.refresh) row = (await syncSubscription(d, row.preapprovalId)) || row;
  if (!row) {
    return { hasSubscription: false, planId: null, planName: null, amount: null, status: null, lastPaymentStatus: null, paidUntil: null, accessUntil: null, nextPaymentDate: null, environment: d.env };
  }
  const cancelled = row.status === 'cancelled';
  return {
    hasSubscription: true,
    planId: row.planId,
    planName: (PLANS_CONFIG as Record<string, any>)[row.planId]?.name || row.planId,
    amount: row.amount,
    status: row.status,
    lastPaymentStatus: row.lastPaymentStatus,
    paidUntil: row.paidUntil,
    accessUntil: row.paidUntil ? (cancelled ? row.paidUntil : addDays(row.paidUntil, GRACE_DAYS)) : null,
    nextPaymentDate: cancelled ? null : row.nextPaymentDate,
    environment: d.env,
  };
}

export async function reconcileAll(d: BillingDeps): Promise<{ checked: number }> {
  const rows = await d.repo.listForReconcile(d.env);
  let checked = 0;
  for (const r of rows) {
    try {
      await syncSubscription(d, r.preapprovalId!);
      checked++;
    } catch {
      // segue para as demais
    }
  }
  return { checked };
}
