import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  const cronSecret = process.env.CRON_SECRET;
  const isSecretConfigured = Boolean(cronSecret && cronSecret.trim().length > 0);
  const isAdmin = Boolean(session && session.role === 'admin');

  // Disponível apenas se o usuário for administrador autenticado E CRON_SECRET estiver configurado no servidor
  const available = isSecretConfigured && isAdmin;

  let reason: string | undefined = undefined;
  if (!isAdmin) {
    reason = 'A verificação da fila exige autenticação de administrador.';
  } else if (!isSecretConfigured) {
    reason = 'A verificação da fila está indisponível porque o segredo CRON_SECRET não está configurado no servidor.';
  }

  return NextResponse.json({
    ok: true,
    configured: isSecretConfigured,
    isAdmin,
    available,
    reason,
  });
}
