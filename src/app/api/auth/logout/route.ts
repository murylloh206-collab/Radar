import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/server/auth';

export async function POST() {
  const response = NextResponse.json({
    ok: true,
    message: 'Sessão encerrada com sucesso.',
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
