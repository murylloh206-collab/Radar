import { NextRequest, NextResponse } from 'next/server';
import {
  checkPlanFeatureAccess,
  isDevEnvironment,
  resolveCurrentUserId,
} from '@/lib/server/plan-guard';
import {
  clearTestConvertedSales,
  getStoreSalesSourcesStatus,
  listConvertedSales,
  parseAffiliateSalesCsv,
  saveConvertedSalesBatch,
  syncShopeeOfficialConversions,
} from '@/lib/server/converted-sales';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const access = await checkPlanFeatureAccess('full_store_metrics', userId);
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          requiredPlan: access.requiredPlan,
          error:
            access.error ||
            'O relatório completo de vendas convertidas por loja é exclusivo do plano Ultimate.',
        },
        { status: 403 }
      );
    }

    const [sales, sources] = await Promise.all([
      listConvertedSales({ userId }),
      getStoreSalesSourcesStatus(userId),
    ]);

    return NextResponse.json({
      ok: true,
      sales,
      sources,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const access = await checkPlanFeatureAccess('full_store_metrics', userId);
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          requiredPlan: access.requiredPlan,
          error:
            access.error ||
            'A sincronização e importação de vendas convertidas é exclusiva do plano Ultimate.',
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'import_csv';

    if (action === 'sync_shopee') {
      const result = await syncShopeeOfficialConversions(userId, Number(body.daysBack || 30));
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (action === 'clear_test_sales') {
      if (!isDevEnvironment()) {
        return NextResponse.json(
          { ok: false, error: 'Limpeza de dados de teste exclusiva de desenvolvimento.' },
          { status: 403 }
        );
      }
      const deletedCount = await clearTestConvertedSales(userId);
      return NextResponse.json({
        ok: true,
        deletedCount,
        message: `${deletedCount} venda(s) de teste removida(s) com sucesso.`,
      });
    }

    if (action === 'import_csv') {
      const csvText = String(body.csvText || '').trim();
      const store = String(body.store || 'mercadolivre').trim();
      const isTest = Boolean(body.isTest);

      if (isTest && !isDevEnvironment()) {
        return NextResponse.json(
          { ok: false, error: 'A importação de CSV de exemplo (teste) só é permitida em ambiente de desenvolvimento.' },
          { status: 403 }
        );
      }

      if (!csvText) {
        return NextResponse.json(
          { ok: false, error: 'Cole ou selecione um arquivo CSV válido com os dados do relatório de afiliado.' },
          { status: 400 }
        );
      }

      const parsed = parseAffiliateSalesCsv(csvText, store, userId, isTest);
      if (parsed.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Nenhuma linha de venda válida foi encontrada no CSV. Certifique-se de que o arquivo possui cabeçalho (ex: pedido, produto, valor, comissao, data).',
          },
          { status: 400 }
        );
      }

      const savedCount = await saveConvertedSalesBatch(userId, parsed);
      return NextResponse.json({
        ok: true,
        importedCount: savedCount,
        source: 'csv_importado',
        isTest,
        message: `${savedCount} venda(s) ${isTest ? 'de teste (is_test=true) ' : ''}importada(s) com sucesso do relatório CSV (${store.toUpperCase()})!`,
      });
    }

    return NextResponse.json({ ok: false, error: 'Ação desconhecida.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

