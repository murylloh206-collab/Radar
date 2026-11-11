import { NextRequest, NextResponse } from 'next/server';
import { resolveCurrentUserId } from '@/lib/server/plan-guard';
import { claimLegacyAccountData, simulateLegacyAccountData } from '@/lib/server/legacy-account-migration';

export async function POST(req: NextRequest) {
  try {
    const currentUserId = resolveCurrentUserId(req);

    if (!currentUserId || currentUserId === '00000000-0000-0000-0000-000000000001') {
      return NextResponse.json(
        { ok: false, error: 'Você precisa estar autenticado em sua conta real para reivindicar os dados legados.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { claimToken, dryRun } = body;

    if (!claimToken) {
      return NextResponse.json(
        { ok: false, error: 'O token de migração (claimToken) é obrigatório.' },
        { status: 400 }
      );
    }

    // Modo Simulação (Dry-Run): lista o que será transferido sem alterar nenhuma linha
    if (dryRun === true) {
      const simulation = await simulateLegacyAccountData(currentUserId, claimToken);
      if (!simulation.success) {
        return NextResponse.json({ ok: false, error: simulation.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        dryRun: true,
        totalRecordsToMigrate: simulation.totalRecordsToMigrate,
        tables: simulation.tables,
      });
    }

    // Execução real e atômica
    const result = await claimLegacyAccountData(currentUserId, claimToken);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Falha ao migrar dados legados.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      message: result.message,
      recordsMigrated: result.recordsMigrated,
      tables: result.tables,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
