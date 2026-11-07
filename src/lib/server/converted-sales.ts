import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ADMIN_UUID } from './auth';
import { getDecryptedCredentials, getSafeVaultStatus } from './credentials-vault';
import { normalizeStoreSlug } from './click-tracker';
import { isDevEnvironment } from './plan-guard';

export type SalesDataSource = 'api_oficial_shopee' | 'csv_importado';

export interface ConvertedSaleRecord {
  id: string;
  userId: string;
  externalOrderId: string;
  store: string; // 'shopee' | 'mercadolivre' | 'amazon' | 'netshoes' | 'magalu' | 'outro'
  productTitle: string;
  orderValue: number;
  commissionValue: number;
  quantity: number;
  status: string;
  dataSource: SalesDataSource;
  saleDate: string;
  createdAt: string;
  isTest?: boolean;
}

export interface StoreSalesSourceStatus {
  store: string;
  displayName: string;
  isCredsConnected: boolean;
  supportsOfficialSalesApi: boolean;
  supportsCsvImport: boolean;
  sourceDescription: string;
  lastSyncStatus?: string;
}

const LOCAL_SALES_FILE = path.join(process.cwd(), '.data', 'converted_sales.json');

function readLocalSales(): ConvertedSaleRecord[] {
  try {
    if (fs.existsSync(LOCAL_SALES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_SALES_FILE, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeLocalSales(records: ConvertedSaleRecord[]): void {
  try {
    const dir = path.dirname(LOCAL_SALES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_SALES_FILE, JSON.stringify(records.slice(0, 5000), null, 2), 'utf-8');
  } catch {}
}

/**
 * Retorna o status transparente das fontes de vendas de cada loja cadastrada.
 * Segue a regra: NUNCA inventar números e informar claramente de onde vem cada dado.
 */
export async function getStoreSalesSourcesStatus(userId: string = ADMIN_UUID): Promise<StoreSalesSourceStatus[]> {
  const vaultStatuses = await getSafeVaultStatus(userId);
  const byStore = new Map(vaultStatuses.map((s) => [s.storeName, s]));

  const stores: Array<{
    slug: string;
    displayName: string;
    supportsOfficialSalesApi: boolean;
    sourceDescription: string;
  }> = [
    {
      slug: 'shopee',
      displayName: 'Shopee',
      supportsOfficialSalesApi: true,
      sourceDescription: 'API Oficial Shopee Affiliate (conversionReport) + Importação de CSV',
    },
    {
      slug: 'mercadolivre',
      displayName: 'Mercado Livre',
      supportsOfficialSalesApi: false,
      sourceDescription: 'Importação de Relatório CSV (O programa de afiliados ML não disponibiliza API pública de conversões)',
    },
    {
      slug: 'amazon',
      displayName: 'Amazon',
      supportsOfficialSalesApi: false,
      sourceDescription: 'Importação de Relatório CSV da Amazon Associados',
    },
    {
      slug: 'netshoes',
      displayName: 'Netshoes',
      supportsOfficialSalesApi: false,
      sourceDescription: 'Importação de Relatório CSV (Rakuten Advertising / Netshoes)',
    },
    {
      slug: 'magalu',
      displayName: 'Magalu',
      supportsOfficialSalesApi: false,
      sourceDescription: 'Importação de Relatório CSV (Parceiro Magalu)',
    },
  ];

  return stores.map((st) => {
    const vault = byStore.get(st.slug as any);
    const isConnected = Boolean(vault && vault.hasCredentials && vault.connectionStatus === 'conectado');
    return {
      store: st.slug,
      displayName: st.displayName,
      isCredsConnected: isConnected,
      supportsOfficialSalesApi: st.supportsOfficialSalesApi,
      supportsCsvImport: true,
      sourceDescription: st.sourceDescription,
    };
  });
}

/**
 * Sincroniza vendas reais convertidas diretamente da API Oficial de Afiliados da Shopee (`conversionReport`).
 * Se a conta não estiver conectada, retorna estado vazio informativo sem inventar dados.
 */
export async function syncShopeeOfficialConversions(
  userId: string = ADMIN_UUID,
  daysBack: number = 30
): Promise<{
  ok: boolean;
  importedCount: number;
  source: SalesDataSource;
  message: string;
}> {
  const creds = await getDecryptedCredentials(userId, 'shopee');
  if (!creds || !creds.appId || !creds.appSecret) {
    return {
      ok: false,
      importedCount: 0,
      source: 'api_oficial_shopee',
      message:
        'Conta da Shopee não conectada com App ID e App Secret. Conecte sua API Oficial da Shopee em Conexões ou importe seu relatório CSV.',
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - Math.max(1, Math.min(90, daysBack)) * 24 * 60 * 60;

  const query = `query {
    conversionReport(purchaseTimeStart: ${startSec}, purchaseTimeEnd: ${nowSec}, limit: 100) {
      nodes {
        conversionId
        purchaseTime
        totalCommission
        orders {
          orderId
          orderStatus
          items {
            itemName
            itemPrice
            itemTotalCommission
            qty
          }
        }
      }
    }
  }`;

  const payload = JSON.stringify({ query });
  const cleanAppId = creds.appId.trim();
  const cleanSecret = creds.appSecret.trim();
  const factor = `${cleanAppId}${nowSec}${payload}${cleanSecret}`;
  const signature = crypto.createHash('sha256').update(factor, 'utf8').digest('hex');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `SHA256 Credential=${cleanAppId}, Timestamp=${nowSec}, Signature=${signature}`,
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.errors?.length) {
      const apiErr = json?.errors?.[0]?.message || `HTTP ${res.status}`;
      return {
        ok: false,
        importedCount: 0,
        source: 'api_oficial_shopee',
        message: `A API Oficial da Shopee respondeu sem conversões ou com aviso: ${apiErr}`,
      };
    }

    const nodes = json?.data?.conversionReport?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return {
        ok: true,
        importedCount: 0,
        source: 'api_oficial_shopee',
        message: 'Sincronização concluída via API Oficial da Shopee: nenhuma venda convertida encontrada no período consultado.',
      };
    }

    const salesToSave: ConvertedSaleRecord[] = [];
    for (const node of nodes) {
      const purchaseIso = node.purchaseTime
        ? new Date(Number(node.purchaseTime) * 1000).toISOString()
        : new Date().toISOString();
      const orders = Array.isArray(node.orders) ? node.orders : [];

      for (const ord of orders) {
        const items = Array.isArray(ord.items) ? ord.items : [];
        if (items.length === 0) {
          salesToSave.push({
            id: crypto.randomUUID(),
            userId,
            externalOrderId: String(ord.orderId || node.conversionId || crypto.randomUUID()),
            store: 'shopee',
            productTitle: 'Pedido Shopee Afiliado',
            orderValue: 0,
            commissionValue: Number(node.totalCommission || 0),
            quantity: 1,
            status: String(ord.orderStatus || 'confirmada').toLowerCase(),
            dataSource: 'api_oficial_shopee',
            saleDate: purchaseIso,
            createdAt: new Date().toISOString(),
          });
        } else {
          items.forEach((it: any, idx: number) => {
            const qty = Math.max(1, Number(it.qty || 1));
            const price = Number(it.itemPrice || 0) * qty;
            const comm = Number(it.itemTotalCommission || node.totalCommission || 0);
            salesToSave.push({
              id: crypto.randomUUID(),
              userId,
              externalOrderId: `${ord.orderId || node.conversionId}-${idx + 1}`,
              store: 'shopee',
              productTitle: String(it.itemName || 'Produto Shopee').slice(0, 180),
              orderValue: Number(price.toFixed(2)),
              commissionValue: Number(comm.toFixed(2)),
              quantity: qty,
              status: String(ord.orderStatus || 'confirmada').toLowerCase(),
              dataSource: 'api_oficial_shopee',
              saleDate: purchaseIso,
              createdAt: new Date().toISOString(),
            });
          });
        }
      }
    }

    await saveConvertedSalesBatch(userId, salesToSave);

    return {
      ok: true,
      importedCount: salesToSave.length,
      source: 'api_oficial_shopee',
      message: `${salesToSave.length} venda(s) sincronizada(s) diretamente da API Oficial da Shopee!`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      importedCount: 0,
      source: 'api_oficial_shopee',
      message: `Falha de rede ao consultar API Oficial da Shopee: ${msg}`,
    };
  }
}

/**
 * Faz o parse de um arquivo CSV real exportado de painéis de afiliados
 * (Mercado Livre, Shopee, Amazon, Netshoes ou formato padrão Radar).
 */
export function parseAffiliateSalesCsv(
  csvText: string,
  defaultStore: string = 'mercadolivre',
  userId: string = ADMIN_UUID,
  isTest: boolean = false
): ConvertedSaleRecord[] {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';

  const splitCsvRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const headers = splitCsvRow(lines[0]).map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  );

  const findCol = (candidates: string[]): number => {
    return headers.findIndex((h) => candidates.some((c) => h.includes(c)));
  };

  const colOrderId = findCol(['pedido', 'order', 'id', 'codigo', 'conversion']);
  const colTitle = findCol(['produto', 'item', 'titulo', 'title', 'nome', 'name']);
  const colValue = findCol(['valor', 'preco', 'price', 'total', 'venda', 'amount', 'gmv']);
  const colComm = findCol(['comissao', 'commission', 'ganho', 'receita', 'payout']);
  const colQty = findCol(['qtd', 'quant', 'qty', 'unidades']);
  const colDate = findCol(['data', 'date', 'horario', 'time', 'criado']);
  const colStore = findCol(['loja', 'store', 'marketplace', 'canal']);

  const parseMoney = (raw?: string): number => {
    if (!raw) return 0;
    const cleaned = raw
      .replace(/[R$\s]/gi, '')
      .replace(/\.(?=\d{3}(?:,|$))/g, '')
      .replace(',', '.');
    const num = Number(cleaned);
    return Number.isFinite(num) && num >= 0 ? Number(num.toFixed(2)) : 0;
  };

  const records: ConvertedSaleRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    if (cols.length < 2) continue;

    const productTitle = (colTitle >= 0 ? cols[colTitle] : cols[1]) || 'Produto Importado via CSV';
    const orderValue = parseMoney(colValue >= 0 ? cols[colValue] : cols[2]);
    const commissionValue = parseMoney(colComm >= 0 ? cols[colComm] : cols[3]);
    const qtyRaw = colQty >= 0 ? Number(cols[colQty]) : 1;
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.round(qtyRaw) : 1;

    const rawStore = colStore >= 0 && cols[colStore] ? cols[colStore] : defaultStore;
    const store = normalizeStoreSlug(rawStore);

    let saleDate = new Date().toISOString();
    if (colDate >= 0 && cols[colDate]) {
      const rawDt = cols[colDate].trim();
      // Suporta DD/MM/YYYY ou YYYY-MM-DD
      const brMatch = rawDt.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (brMatch) {
        const parsed = new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T12:00:00Z`);
        if (!isNaN(parsed.getTime())) saleDate = parsed.toISOString();
      } else {
        const parsed = new Date(rawDt);
        if (!isNaN(parsed.getTime())) saleDate = parsed.toISOString();
      }
    }

    const externalOrderId =
      (colOrderId >= 0 && cols[colOrderId]) ||
      crypto
        .createHash('sha1')
        .update(`${store}::${productTitle}::${orderValue}::${saleDate}::${i}`)
        .digest('hex')
        .slice(0, 14);

    if (orderValue <= 0 && commissionValue <= 0) continue;

    records.push({
      id: crypto.randomUUID(),
      userId,
      externalOrderId,
      store,
      productTitle: productTitle.slice(0, 180),
      orderValue,
      commissionValue,
      quantity,
      status: 'confirmada',
      dataSource: 'csv_importado',
      saleDate,
      createdAt: new Date().toISOString(),
      isTest: Boolean(isTest),
    });
  }

  return records;
}

export async function saveConvertedSalesBatch(
  userId: string,
  newSales: ConvertedSaleRecord[]
): Promise<number> {
  if (!newSales.length) return 0;

  const existing = readLocalSales();
  const byKey = new Map<string, ConvertedSaleRecord>();
  for (const s of existing) {
    byKey.set(`${s.userId}::${s.store}::${s.externalOrderId}`, s);
  }
  for (const s of newSales) {
    byKey.set(`${userId}::${s.store}::${s.externalOrderId}`, { ...s, userId });
  }

  const merged = Array.from(byKey.values()).sort(
    (a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()
  );
  writeLocalSales(merged);

  if (isSupabaseConfigured && supabase) {
    try {
      const rows = newSales.map((s) => ({
        user_id: userId,
        external_order_id: s.externalOrderId,
        store: s.store,
        product_title: s.productTitle,
        order_value: s.orderValue,
        commission_value: s.commissionValue,
        quantity: s.quantity,
        status: s.status,
        data_source: s.dataSource,
        sale_date: s.saleDate,
        is_test: Boolean(s.isTest),
      }));
      await supabase.from('converted_sales').upsert(rows, {
        onConflict: 'user_id,store,external_order_id',
      });
    } catch {}
  }

  return newSales.length;
}

export async function listConvertedSales(params?: {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  store?: string;
  excludeTest?: boolean;
}): Promise<ConvertedSaleRecord[]> {
  const userId = params?.userId || ADMIN_UUID;
  const local = readLocalSales().filter((s) => !s.userId || s.userId === userId);
  const byKey = new Map<string, ConvertedSaleRecord>();

  for (const s of local) {
    byKey.set(`${s.store}::${s.externalOrderId}`, s);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase
        .from('converted_sales')
        .select('*')
        .eq('user_id', userId)
        .order('sale_date', { ascending: false })
        .limit(2000);

      if (params?.startDate) {
        query = query.gte('sale_date', params.startDate.toISOString());
      }
      if (params?.endDate) {
        query = query.lte('sale_date', params.endDate.toISOString());
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const key = `${row.store}::${row.external_order_id}`;
          if (!byKey.has(key)) {
            byKey.set(key, {
              id: row.id,
              userId: row.user_id,
              externalOrderId: row.external_order_id,
              store: normalizeStoreSlug(row.store),
              productTitle: row.product_title,
              orderValue: Number(row.order_value || 0),
              commissionValue: Number(row.commission_value || 0),
              quantity: Number(row.quantity || 1),
              status: row.status || 'confirmada',
              dataSource: (row.data_source as SalesDataSource) || 'csv_importado',
              saleDate: row.sale_date || row.created_at,
              createdAt: row.created_at,
              isTest: Boolean(row.is_test),
            });
          }
        }
      }
    } catch {}
  }

  let list = Array.from(byKey.values());
  const mustExcludeTest = params?.excludeTest === true || !isDevEnvironment();
  if (mustExcludeTest) {
    list = list.filter((s) => !s.isTest);
  }

  if (params?.startDate) {
    const minMs = params.startDate.getTime();
    list = list.filter((s) => new Date(s.saleDate).getTime() >= minMs);
  }
  if (params?.endDate) {
    const maxMs = params.endDate.getTime();
    list = list.filter((s) => new Date(s.saleDate).getTime() <= maxMs);
  }
  if (params?.store && params.store !== 'all') {
    const target = normalizeStoreSlug(params.store);
    list = list.filter((s) => s.store === target);
  }

  return list.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
}

/**
 * Apaga todas as vendas convertidas marcadas com `isTest === true` (`is_test = true`).
 */
export async function clearTestConvertedSales(userId: string = ADMIN_UUID): Promise<number> {
  const existing = readLocalSales();
  const kept = existing.filter((s) => !(s.isTest && (!s.userId || s.userId === userId)));
  const deletedCount = existing.length - kept.length;
  writeLocalSales(kept);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('converted_sales').delete().eq('user_id', userId).eq('is_test', true);
    } catch {}
  }

  return deletedCount;
}
