import { NextResponse } from 'next/server';
import { findBotChatUrl } from '@/lib/server/group-bot';

export const dynamic = 'force-dynamic';

/** Botão "Usar só o bot": abre a conversa com o assistente. Desligado ou sem número → volta para a página do grupo. */
export async function GET(req: Request) {
  const url = await findBotChatUrl();
  return NextResponse.redirect(url || new URL('/grupo', req.url), { status: 302, headers: { 'Cache-Control': 'no-store' } });
}
