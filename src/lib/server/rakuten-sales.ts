import 'server-only';
import type { ConvertedSaleRecord } from './converted-sales';

/*
 * Vendas da Netshoes pela API de transações da Rakuten (Events API), com as credenciais do conector.
 */
const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Converte as transações da Rakuten (formato da Events API) em vendas do Radar. */
export function rakutenTransactionsToSales(userId: string, rows: unknown[]): ConvertedSaleRecord[] {
  return rows.flatMap(raw => {
    const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const order = String(t.order_id || '').trim();
    const id = String(t.etransaction_id || '').trim() || (order ? `${order}-${String(t.sku_number || '1')}` : '');
    if (!id) return [];
    const when = String(t.transaction_date || t.process_date || '');
    const iso = when ? new Date(when.includes('T') ? when : `${when.replace(' ', 'T')}Z`).toISOString() : new Date().toISOString();
    const quantity = Math.max(1, Math.round(num(t.quantity)) || 1);
    const sale = num(t.sale_amount);
    const commission = num(t.commissions);
    const type = String(t.transaction_type || '').toLowerCase();
    return [{
      id,
      userId,
      externalOrderId: id,
      store: 'netshoes',
      productTitle: String(t.product_name || t.sku_number || 'Pedido Netshoes').slice(0, 180),
      orderValue: Number(sale.toFixed(2)),
      commissionValue: Number(commission.toFixed(2)),
      quantity,
      status: sale < 0 || commission < 0 || type.includes('cancel') || type.includes('return') ? 'cancelada' : 'pendente',
      dataSource: 'api_oficial_rakuten' as const,
      saleDate: iso,
      createdAt: new Date().toISOString(),
    }];
  });
}

export async function fetchRakutenSales(userId: string, daysBack = 3): Promise<ConvertedSaleRecord[]> {
  const { getDecryptedCredentials } = await import('./credentials-vault');
  const { rakutenFetch } = await import('./rakuten-auth');
  const { rakutenCredentialsFrom } = await import('./affiliate-converter');
  const creds = rakutenCredentialsFrom(await getDecryptedCredentials(userId, 'netshoes' as any) as any);
  if (!creds.clientId || !creds.clientSecret || !creds.sid) return [];
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
  const end = new Date();
  const start = new Date(end.getTime() - Math.min(29, Math.max(1, daysBack)) * 86_400_000);
  const url = `https://api.linksynergy.com/events/1.0/transactions?transaction_date_start=${encodeURIComponent(fmt(start))}`
    + `&transaction_date_end=${encodeURIComponent(fmt(end))}&limit=1000`;
  const res = await rakutenFetch(creds, url, { method: 'GET', signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? rakutenTransactionsToSales(userId, data) : [];
}
