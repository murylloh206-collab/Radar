import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/server/auth';
import { ensureUserSubscription } from '@/lib/server/plan-guard';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, acceptedTerms, refCode } = body;

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanEmail || !cleanPass) {
      return NextResponse.json({ ok: false, error: 'E-mail e senha são obrigatórios.' }, { status: 400 });
    }

    if (!acceptedTerms) {
      return NextResponse.json(
        { ok: false, error: 'É obrigatório aceitar os Termos de Uso e a Política de Privacidade.' },
        { status: 400 }
      );
    }

    if (cleanPass.length < 6) {
      return NextResponse.json({ ok: false, error: 'A senha deve ter no mínimo 6 caracteres.' }, { status: 400 });
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
          accepted_terms: true,
          accepted_terms_at: new Date().toISOString(),
          referred_by: refCode || null,
        },
      },
    });

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, error: error?.message || 'Falha ao criar usuário no Supabase Auth.' },
        { status: 400 }
      );
    }

    const userId = data.user.id;
    // Se não há sessão retornada no signUp, significa que a confirmação de e-mail é obrigatória
    const requiresEmailConfirmation = !data.session;

    // REGRA ESTABELECIDA: O trial de 7 dias NÃO é ativado até que o e-mail seja confirmado.
    // Se o usuário ainda não confirmou o e-mail, registramos a assinatura como 'pending_confirmation'.
    if (!requiresEmailConfirmation) {
      // Confirmação já atendida ou desativada no Supabase
      await ensureUserSubscription(userId, {
        referredBy: refCode || null,
        customStatus: 'trialing',
      });
    } else {
      // Cria registro aguardando verificação do e-mail (sem conceder os 7 dias de trial até o primeiro login verificado)
      await ensureUserSubscription(userId, {
        referredBy: refCode || null,
        customStatus: 'pending_confirmation' as any,
      });
    }

    const response = NextResponse.json({
      ok: true,
      requiresEmailConfirmation,
      user: {
        id: userId,
        email: cleanEmail,
      },
    });

    // Se já estiver confirmado/logado de imediato, emite cookie de sessão
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
