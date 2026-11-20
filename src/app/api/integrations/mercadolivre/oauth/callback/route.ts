import { NextRequest, NextResponse } from 'next/server';
import { isAssistantOwner } from '@/lib/server/assistant/access';
import { completeAuthorization, readState } from '@/lib/server/ml-api';

export const dynamic = 'force-dynamic';

/**
 * Volta da tela de autorização do Mercado Livre (domínio antigo, sem o login do painel).
 * A conta e o verificador vêm cifrados no state; só a conta dona é aceita. Depois volta ao painel.
 */
export async function GET(req: NextRequest) {
  // Volta para o endereço principal, onde está o login do painel.
  const panel = 'https://radarofertasbr.vercel.app';
  const back = (status: string) => NextResponse.redirect(`${panel}/assistente?ml=${status}`);
  const code = req.nextUrl.searchParams.get('code') || '';
  const parsed = readState(req.nextUrl.searchParams.get('state') || '');
  if (!code || !parsed) return back('expirado');
  if (!isAssistantOwner(parsed.userId)) return back('negado');
  try {
    await completeAuthorization(parsed.userId, code, parsed.verifier);
    return back('ok');
  } catch (error) {
    console.error('[ML API] autorização falhou:', error instanceof Error ? error.message : error);
    return back('erro');
  }
}
