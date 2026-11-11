import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/server/auth';
import { ensureUserSubscription } from '@/lib/server/plan-guard';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, acceptedTerms, refCode } = body;

    const cleanName = String(name || '').trim().slice(0, 80);
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanEmail || !cleanPass) {
      return NextResponse.json({ ok: false, error: 'E-mail e senha são obrigatórios.' }, { status: 400 });
    }

    if (!acceptedTerms) {
      return NextResponse.json(
        { ok: false, error: 'Confirme os Termos de Uso e a Política de Privacidade para criar sua conta.' },
        { status: 400 }
      );
    }

    if (cleanPass.length < 8) {
      return NextResponse.json({ ok: false, error: 'Use pelo menos 8 caracteres na senha.' }, { status: 400 });
    }

    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json(
        { ok: false, error: 'Serviço de autenticação do Supabase não configurado no servidor.' },
        { status: 500 }
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: {
        data: {
          name: cleanName || undefined,
          full_name: cleanName || undefined,
          accepted_terms: true,
          accepted_terms_at: new Date().toISOString(),
          referred_by: refCode || null,
        },
      },
    });

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, error: error?.message || 'Não foi possível criar a conta agora. Verifique os dados e tente novamente.' },
        { status: 400 }
      );
    }

    const userId = data.user.id;
    const requiresEmailConfirmation = !data.session;

    // Sem período de teste grátis: conta criada sem ativar assinatura paga nem liberar recursos pagos indevidamente
    await ensureUserSubscription(userId, {
      referredBy: refCode || null,
      customStatus: 'canceled',
      withoutTrial: true,
    });

    const response = NextResponse.json({
      ok: true,
      requiresEmailConfirmation,
      user: {
        id: userId,
        name: cleanName || undefined,
        email: cleanEmail,
      },
    });

    if (data.session) {
      const token = signSession({
        userId,
        email: cleanEmail,
        role: 'user',
      });

      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
