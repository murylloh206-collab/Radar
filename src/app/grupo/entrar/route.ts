import { NextResponse } from 'next/server';
import { resolveRotationInvite } from '@/lib/server/group-rotation-live';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Botão "Entrar no grupo": manda para o primeiro grupo #N com vaga. */
export async function GET() {
  const response = NextResponse.redirect(await resolveRotationInvite(), 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
