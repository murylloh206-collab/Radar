import { NextResponse } from 'next/server';
import { resolveRotationTarget } from '@/lib/server/group-rotation-live';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Número do grupo da vez (#N) para o selo da página /grupo. Cache na CDN: 60 s, servindo o anterior enquanto atualiza. */
export async function GET() {
  const target = await resolveRotationTarget();
  return NextResponse.json({ number: target.number }, {
    headers: { 'Cache-Control': target.number ? 'public, s-maxage=60, stale-while-revalidate=600' : 'no-store' },
  });
}
