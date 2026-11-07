import { NextRequest, NextResponse } from 'next/server';
import { readDatabase } from '@/lib/server/storage';
import {
  findTrackedLinkByCode,
  normalizeStoreSlug,
  recordClickEvent,
  resolveClickOrigin,
  type ClickOrigin,
} from '@/lib/server/click-tracker';
import { checkPublicRouteRateLimit } from '@/lib/server/rate-limiter';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ code: string }> }
) {
  const rateLimit = checkPublicRouteRateLimit(req, 'redirect', 90);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Muitas requisições. Tente novamente em instantes.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
      }
    );
  }

  const { code: rawCode } = await props.params;
  const code = rawCode?.trim();
  if (!code) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const { searchParams } = new URL(req.url);
  const queryOrigin = searchParams.get('src') || searchParams.get('origem') || searchParams.get('utm_source');
  const queryTitle = searchParams.get('title') || searchParams.get('produto');
  const queryStore = searchParams.get('store') || searchParams.get('loja');

  let destinationUrl: string | null = null;
  let store: string | null = queryStore || null;
  let productTitle: string | null = queryTitle || null;
  let fallbackOrigin: ClickOrigin | null = null;

  // 1. Tenta buscar na tabela tracked_links (Supabase ou armazenamento local)
  const trackedLink = await findTrackedLinkByCode(code);
  if (trackedLink) {
    destinationUrl = trackedLink.destinationUrl;
    store = store || trackedLink.store;
    productTitle = productTitle || trackedLink.productTitle;
    fallbackOrigin = trackedLink.originDefault;
  }

  // 2. Se não encontrou em tracked_links, tenta buscar em jobs recentes ou catálogo
  if (!destinationUrl) {
    const db = readDatabase();
    const matchedJob = db.jobs.find(
      (j) => j.id.startsWith(code) || (j.affiliateUrl && j.affiliateUrl.includes(code))
    );
    if (matchedJob) {
      destinationUrl = matchedJob.affiliateUrl;
      productTitle = productTitle || matchedJob.targetName || 'Oferta Publicada';
      fallbackOrigin = 'whatsapp';
    }

    if (!destinationUrl) {
      const matchedProd = db.products.find(
        (p) => p.id.startsWith(code) || p.externalId === code
      );
      if (matchedProd) {
        destinationUrl = matchedProd.affiliateUrl;
        store = store || matchedProd.storeName;
        productTitle = productTitle || matchedProd.title;
        fallbackOrigin = 'vitrine';
      }
    }
  }

  // 3. Fallback: decodificação stateless via Base64URL
  if (!destinationUrl) {
    try {
      const decoded = Buffer.from(code, 'base64url').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        destinationUrl = decoded;
      }
    } catch {}
  }

  // Se nenhuma URL de destino for encontrada, redirecionar para a home
  if (!destinationUrl) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const userAgent = req.headers.get('user-agent') || 'desconhecido';
  const referer = req.headers.get('referer') || req.headers.get('origin') || 'direto';

  const resolvedOrigin = resolveClickOrigin({
    queryOrigin,
    referer,
    userAgent,
    fallbackOrigin,
  });

  const resolvedStore = normalizeStoreSlug(store, destinationUrl);

  // 4. Registrar evento de clique completo (data, loja, produto e origem)
  await recordClickEvent({
    code,
    destinationUrl,
    store: resolvedStore,
    productTitle: productTitle || 'Oferta Rastreada',
    origin: resolvedOrigin,
    userAgent,
    referer,
  });

  // 5. Redirecionamento temporário 307 para o link de afiliado oficial
  return NextResponse.redirect(destinationUrl, 307);
}
