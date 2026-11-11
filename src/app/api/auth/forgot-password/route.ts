import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cleanEmail = String(body?.email || '').trim().toLowerCase();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json(
        { ok: false, error: 'Informe um e-mail válido para continuar.' },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json(
        {
          ok: false,
          error: 'O envio de recuperação não está disponível neste ambiente. Entre em contato com o suporte.',
        },
        { status: 503 }
      );
    }

    const origin = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${origin}/login`,
    });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Não foi possível solicitar a recuperação agora. Tente novamente em instantes ou fale com o suporte.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Se este e-mail estiver vinculado a uma conta, enviaremos as instruções de recuperação.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

