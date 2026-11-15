import { NextResponse } from 'next/server';
import { lastRotationSource, resolveRotationTarget, FALLBACK_GROUP_INVITE, type RotationTarget } from '@/lib/server/group-rotation-live';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BUDGET_MS = 3000;

/**
 * Botão "Entrar no grupo": manda para o primeiro grupo #N com vaga.
 * O visitante nunca espera a consulta ao WhatsApp: a CDN guarda o redirecionamento por 60 s e, depois disso,
 * entrega o anterior na hora enquanto atualiza em segundo plano. Sem CDN, limite de 3 s com o último link bom.
 */
export async function GET() {
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), BUDGET_MS));
  const target: RotationTarget | null = await Promise.race([resolveRotationTarget(), timeout]);
  const response = NextResponse.redirect(target?.url || FALLBACK_GROUP_INVITE, 302);
  response.headers.set('Cache-Control', target?.number
    ? 'public, s-maxage=60, stale-while-revalidate=86400'
    : 'no-store');
  response.headers.set('X-Rotation', target ? lastRotationSource.replace(/[^ -~]/g, '') : 'timeout');
  return response;
}
