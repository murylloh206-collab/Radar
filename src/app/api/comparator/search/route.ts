import { NextRequest, NextResponse } from 'next/server';
import { checkPlanFeatureAccess, resolveCurrentUserId } from '@/lib/server/plan-guard';
import { runComparatorSearch } from '@/lib/server/comparator-search';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const access = await checkPlanFeatureAccess('comparator_search', userId);
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          requiredPlan: access.requiredPlan,
          error:
            access.error ||
            'O Buscador Comparador multiloja é exclusivo do plano Ultimate.',
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
    const forceRefresh = searchParams.get('refresh') === '1';

    if (!query) {
      return NextResponse.json(
        { ok: false, error: 'Digite o nome de um produto para buscar e comparar.' },
        { status: 400 }
      );
    }

    const result = await runComparatorSearch({
      query,
      userId,
      forceRefresh,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const access = await checkPlanFeatureAccess('comparator_search', userId);
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          requiredPlan: access.requiredPlan,
          error:
            access.error ||
            'O Buscador Comparador multiloja é exclusivo do plano Ultimate.',
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body.query || body.q || '').trim();
    const forceRefresh = Boolean(body.forceRefresh);

    if (!query) {
      return NextResponse.json(
        { ok: false, error: 'Digite o nome de um produto para buscar e comparar.' },
        { status: 400 }
      );
    }

    const result = await runComparatorSearch({
      query,
      userId,
      forceRefresh,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

