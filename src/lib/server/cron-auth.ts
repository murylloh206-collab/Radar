import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Valida o segredo das chamadas automáticas (agendador do Supabase, cron externo).
 * Retorna null quando autorizado; caso contrário, a resposta de erro pronta.
 */
export function checkCronSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'Agendador não configurado: CRON_SECRET ausente no servidor.' }, { status: 503 });
  }
  if (['secret', 'token', 'cron_secret'].some(name => req.nextUrl.searchParams.has(name))) {
    return NextResponse.json({ ok: false, error: 'Segredos na URL não são permitidos. Envie pelo cabeçalho Authorization: Bearer <CRON_SECRET>.' }, { status: 400 });
  }
  const supplied = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || req.headers.get('x-cron-secret')?.trim() || '';
  if (!supplied || !timingSafeEqual(digest(supplied), digest(expected))) {
    return NextResponse.json({ ok: false, error: 'Acesso não autorizado: segredo do agendador inválido ou ausente.' }, { status: 401 });
  }
  return null;
}
