import { NextResponse } from 'next/server';
import { lastRotationSource, resolveRotationInvite } from '@/lib/server/group-rotation-live';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Botão "Entrar no grupo": manda para o primeiro grupo #N com vaga. */
export async function GET() {
  const response = NextResponse.redirect(await resolveRotationInvite(), 302);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Rotation', lastRotationSource.replace(/[^ -~]/g, ''));
  return response;
}
