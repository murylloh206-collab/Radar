import { NextRequest, NextResponse } from 'next/server';
import { authenticate, signSession, SESSION_COOKIE_NAME } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    const result = await authenticate(email, password);

    if (!result.success || !result.session) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    const token = signSession({
      userId: result.session.userId,
      email: result.session.email,
      role: result.session.role,
    });

    const response = NextResponse.json({
      ok: true,
      message: 'Autenticado com sucesso!',
      user: {
        userId: result.session.userId,
        email: result.session.email,
        role: result.session.role,
      },
    });

    // Definir cookie seguro HTTP-only
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 dias
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
