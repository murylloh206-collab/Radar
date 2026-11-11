import { NextRequest, NextResponse } from 'next/server';
import { inspectSessionEdge, SESSION_COOKIE_NAME } from './lib/edge-session';

function sanitizeRedirect(target?: string | null): string {
  if (!target || typeof target !== 'string') return '/painel';
  const trimmed = target.trim();
  if (
    !trimmed ||
    trimmed === '/' ||
    trimmed === '%2F' ||
    trimmed.startsWith('/login') ||
    trimmed.startsWith('/cadastro') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//')
  ) {
    return '/painel';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

// Rotas públicas que não exigem login
const PUBLIC_PREFIXES = [
  '/login',
  '/cadastro',
  '/planos',
  '/termos',
  '/privacidade',
  '/ajuda',
  '/grupo',
  '/r/',
  '/u/',
  '/@',
  '/%40',
];

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

  // 1.1 Redirecionamento de compatibilidade com rotas legadas inteligente
  if (pathname === '/automacao') {
    const tab = (req.nextUrl.searchParams.get('tab') || req.nextUrl.searchParams.get('aba') || '').toLowerCase();
    let dest = '/ofertas?aba=busca-automatica';
    if (tab.includes('curador') || tab.includes('curadoria')) {
      dest = '/ofertas?aba=curadoria';
    } else if (tab.includes('lista') || tab.includes('lote') || tab.includes('campanha')) {
      dest = '/envios?aba=campanhas';
    } else if (tab.includes('garimpo') || tab.includes('busca')) {
      dest = '/ofertas?aba=busca-automatica';
    }
    const targetUrl = new URL(dest, req.url);
    req.nextUrl.searchParams.forEach((val, key) => {
      if (key !== 'tab' && key !== 'aba') targetUrl.searchParams.set(key, val);
    });
    return NextResponse.redirect(targetUrl);
  }

  if (pathname === '/ajustes') {
    const secao = (req.nextUrl.searchParams.get('secao') || req.nextUrl.searchParams.get('tab') || req.nextUrl.searchParams.get('aba') || '').toLowerCase();
    let dest = '/conexoes?aba=lojas';
    if (secao.includes('whatsapp') || secao.includes('conexao')) {
      dest = '/conexoes?aba=whatsapp';
    } else if (secao.includes('curador') || secao.includes('qualidade') || secao.includes('filtro')) {
      dest = '/ofertas?aba=curadoria';
    } else if (secao.includes('template')) {
      dest = '/criar-conteudo?aba=templates';
    } else if (secao.includes('loja')) {
      dest = '/conexoes?aba=lojas';
    }
    const targetUrl = new URL(dest, req.url);
    req.nextUrl.searchParams.forEach((val, key) => {
      if (key !== 'secao' && key !== 'tab' && key !== 'aba') targetUrl.searchParams.set(key, val);
    });
    return NextResponse.redirect(targetUrl);
  }

  const LEGACY_ROUTES: Record<string, string> = {
    '/gerar-postagem': '/criar-conteudo?aba=oferta-link',
    '/mensagem-avulsa': '/criar-conteudo?aba=mensagem-livre',
    '/stories': '/criar-conteudo?aba=story',
    '/agenda': '/envios?aba=agenda',
    '/analytics': '/resultados?aba=grupos',
    '/relatorios': '/resultados?aba=vendas',
    '/bio-link': '/pagina-publica',
    '/conexao-whatsapp': '/conexoes?aba=whatsapp',
    '/conectar-lojas': '/conexoes?aba=lojas',
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

  const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false';

  // 3. Rotas públicas de API (autenticação própria via token de webhook / cron)
  if (
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/webhook/evolution' ||
    pathname === '/api/worker/poll' ||
    pathname.startsWith('/api/comparator/search')
  ) {
    return NextResponse.next();
  }

  // 3.1 Se for qualquer rota pública, permitir passagem livre
  const isPublicRoute =
    pathname === '/' ||
    PUBLIC_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix)
    );

  if (isPublicRoute) {
    // Se o usuário já estiver logado e tentar abrir /login ou /cadastro, manda para o painel com destino seguro
    if (isAuthenticated && (pathname === '/login' || pathname === '/cadastro')) {
      const safeTarget = sanitizeRedirect(req.nextUrl.searchParams.get('redirect'));
      return NextResponse.redirect(new URL(safeTarget, req.url));
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

  // 5. Qualquer outra página privada: redirecionar para /login se não autenticado
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', req.url);
    const safeRedirect = sanitizeRedirect(pathname);
    if (safeRedirect !== '/painel') {
      loginUrl.searchParams.set('redirect', safeRedirect);
    }
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
