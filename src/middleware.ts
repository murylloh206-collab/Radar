import { NextRequest, NextResponse } from 'next/server';
import { inspectSessionEdge, SESSION_COOKIE_NAME } from './lib/edge-session';

const PUBLIC_PAGE_PATHS = ['/login', '/u/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Ignorar arquivos estáticos e internos do Next.js
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo.png' ||
    pathname === '/icon.png' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 1.1 Redirecionamento de compatibilidade com rotas legadas (preservando parâmetros)
  const LEGACY_ROUTES: Record<string, string> = {
    '/gerar-postagem': '/criar-conteudo?aba=oferta-link',
    '/mensagem-avulsa': '/criar-conteudo?aba=mensagem-livre',
    '/stories': '/criar-conteudo?aba=story',
    '/automacao': '/ofertas?aba=busca-automatica',
    '/agenda': '/envios?aba=agenda',
    '/analytics': '/resultados?aba=grupos',
    '/relatorios': '/resultados?aba=vendas',
    '/bio-link': '/pagina-publica',
    '/conexao-whatsapp': '/conexoes?aba=whatsapp',
    '/conectar-lojas': '/conexoes?aba=lojas',
    '/ajustes': '/conexoes?aba=lojas',
  };

  if (LEGACY_ROUTES[pathname]) {
    const targetUrl = new URL(LEGACY_ROUTES[pathname], req.url);
    req.nextUrl.searchParams.forEach((val, key) => {
      if (!targetUrl.searchParams.has(key)) {
        targetUrl.searchParams.set(key, val);
      }
    });
    return NextResponse.redirect(targetUrl);
  }

  // 2. Extrair token de sessão do cookie ou header
  const token =
    req.cookies.get(SESSION_COOKIE_NAME)?.value ||
    (req.headers.get('authorization')?.startsWith('Bearer ')
      ? req.headers.get('authorization')?.substring(7).trim()
      : undefined);

  const inspection = await inspectSessionEdge(token);
  const isAuthenticated = Boolean(inspection.valid);
  const isExpired = Boolean(inspection.expired);

  const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

  // 3. Rotas públicas de API (autenticação própria via token de webhook / cron)
  if (
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/webhook/evolution' ||
    pathname === '/api/worker/poll'
  ) {
    return NextResponse.next();
  }

  // Se REQUIRE_AUTH estiver desativado (padrão sem tela de login)
  if (!REQUIRE_AUTH) {
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // 4. Bloquear APIs privadas para requisições sem autenticação
  if (pathname.startsWith('/api/')) {
    if (!isAuthenticated) {
      if (isExpired) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Sua sessão expirou. Por favor, faça login novamente.',
            code: 'SESSION_EXPIRED',
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error: 'Acesso não autorizado. É necessário efetuar login para acessar este endpoint.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // 5. Bio links públicos (/u/[slug])
  if (pathname.startsWith('/u/')) {
    return NextResponse.next();
  }

  // 6. Página de login
  if (pathname === '/login') {
    if (isAuthenticated) {
      const redirectTarget = req.nextUrl.searchParams.get('redirect') || '/';
      return NextResponse.redirect(new URL(redirectTarget, req.url));
    }
    return NextResponse.next();
  }

  // 7. Qualquer outra página privada: redirecionar para /login se não autenticado
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    if (isExpired) {
      loginUrl.searchParams.set('expired', 'true');
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
