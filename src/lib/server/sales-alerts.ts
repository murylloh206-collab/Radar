import 'server-only';
import { ADMIN_UUID } from './auth';
import type { ConvertedSaleRecord } from './converted-sales';
import type { OwnerNotice } from './owner-notify';

/*
 * Aviso de venda convertida no celular do dono (Shopee pela API oficial, Netshoes pela Rakuten).
 * "Nova" = linha que o banco aceitou inserir agora (upsert ignorando duplicadas) → cada venda avisa uma vez.
 */
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const STORE_NAME: Record<string, string> = { shopee: 'Shopee', netshoes: 'Netshoes', mercadolivre: 'Mercado Livre', amazon: 'Amazon' };

/** Só vendas recentes, reais e não canceladas entram no aviso. */
export function alertableSales(sales: ConvertedSaleRecord[], nowMs: number, maxAgeHours = 72): ConvertedSaleRecord[] {
  return sales.filter(sale => {
    if (sale.isTest || /cancel/i.test(sale.status || '')) return false;
    const at = Date.parse(sale.saleDate);
    return Number.isFinite(at) && nowMs - at <= maxAgeHours * 3_600_000;
  });
}

export function salesAlertMessage(sales: ConvertedSaleRecord[]): OwnerNotice | null {
  if (!sales.length) return null;
  const commission = sales.reduce((sum, sale) => sum + (sale.commissionValue || 0), 0);
  const stores = [...new Set(sales.map(sale => STORE_NAME[sale.store] || sale.store))];
  const title = sales.length === 1
    ? `Venda na ${stores[0]}! +${brl(commission)}`
    : `${sales.length} vendas novas (${stores.join(', ')}) +${brl(commission)}`;
  const lines = sales.slice(0, 5).map(sale =>
    `• ${sale.productTitle.slice(0, 70)}${sale.orderValue ? ` (${brl(sale.orderValue)})` : ''} → comissão ${brl(sale.commissionValue || 0)}`);
  if (sales.length > 5) lines.push(`+ ${sales.length - 5} outras`);
  return { title, body: lines.join('\n'), tags: 'moneybag', priority: 'high' };
}

export interface SalesAlertDeps {
  fetchSales(userId: string): Promise<ConvertedSaleRecord[]>;
  insertNew(userId: string, sales: ConvertedSaleRecord[]): Promise<ConvertedSaleRecord[]>;
  saveAll(userId: string, sales: ConvertedSaleRecord[]): Promise<void>;
  notify(notice: OwnerNotice): Promise<boolean>;
  now(): number;
}

async function defaultDeps(): Promise<SalesAlertDeps> {
  const { fetchShopeeConversions, saveConvertedSalesBatch } = await import('./converted-sales');
  const { fetchRakutenSales } = await import('./rakuten-sales');
  const { notifyOwner } = await import('./owner-notify');
  const { isSupabaseConfigured, supabase } = await import('@/lib/supabase');
  return {
    async fetchSales(userId) {
      const [shopee, netshoes] = await Promise.all([
        fetchShopeeConversions(userId, 3).then(r => r.sales).catch(() => []),
        fetchRakutenSales(userId, 3).catch(() => []),
      ]);
      return [...shopee, ...netshoes];
    },
    async insertNew(userId, sales) {
      if (!isSupabaseConfigured || !supabase || !sales.length) return [];
      const rows = sales.map(s => ({
        user_id: userId, external_order_id: s.externalOrderId, store: s.store, product_title: s.productTitle,
        order_value: s.orderValue, commission_value: s.commissionValue, quantity: s.quantity, status: s.status,
        data_source: s.dataSource, sale_date: s.saleDate, is_test: Boolean(s.isTest),
      }));
      const inserted: ConvertedSaleRecord[] = [];
      // Uma loja por vez: se o banco recusar uma (ex.: migração pendente), as outras seguem.
      for (const store of [...new Set(rows.map(r => r.store))]) {
        const { data, error } = await supabase.from('converted_sales')
          .upsert(rows.filter(r => r.store === store), { onConflict: 'user_id,store,external_order_id', ignoreDuplicates: true })
          .select('store, external_order_id');
        if (error || !data) continue;
        const keys = new Set(data.map((r: any) => `${r.store}::${r.external_order_id}`));
        inserted.push(...sales.filter(s => keys.has(`${s.store}::${s.externalOrderId}`)));
      }
      return inserted;
    },
    async saveAll(userId, sales) { await saveConvertedSalesBatch(userId, sales); },
    notify: notifyOwner,
    now: () => Date.now(),
  };
}

export async function runSalesAlerts(deps?: SalesAlertDeps, userId: string = ADMIN_UUID): Promise<{ fetched: number; alerted: number }> {
  const d = deps || (await defaultDeps());
  const sales = await d.fetchSales(userId);
  if (!sales.length) return { fetched: 0, alerted: 0 };
  const fresh = await d.insertNew(userId, sales);
  await d.saveAll(userId, sales).catch(() => {}); // atualiza status (pendente → concluída) das já conhecidas
  const toAlert = alertableSales(fresh, d.now());
  const notice = salesAlertMessage(toAlert);
  if (notice) await d.notify(notice);
  return { fetched: sales.length, alerted: toAlert.length };
}
