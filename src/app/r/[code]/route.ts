import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { readDatabase } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ code: string }> }
) {
  const { code: rawCode } = await props.params;
  const code = rawCode?.trim();
  if (!code) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  let destinationUrl: string | null = null;
  let store: string | null = null;
  let productTitle: string | null = null;

  // 1. Tenta buscar na tabela tracked_links do Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('tracked_links')
        .select('*')
        .eq('code', code)
        .maybeSingle();

      if (!error && data?.destination_url) {
        destinationUrl = data.destination_url;
        store = data.store || null;
        productTitle = data.product_title || null;

        // Atualizar contador de cliques na tabela tracked_links
        void supabase
          .from('tracked_links')
          .update({
            clicks_count: (data.clicks_count || 0) + 1,
            last_clicked_at: new Date().toISOString(),
          })
          .eq('id', data.id);
      }
    } catch {}
  }

  // 2. Se não encontrou no Supabase, tenta buscar em jobs recentes ou catálogo
  if (!destinationUrl) {
    const db = readDatabase();
    // Tenta encontrar em jobs
    const matchedJob = db.jobs.find(
      (j) => j.id.startsWith(code) || j.affiliateUrl.includes(code)
    );
    if (matchedJob) {
      destinationUrl = matchedJob.affiliateUrl;
      productTitle = matchedJob.targetName || null;
    }

    // Tenta encontrar em catálogo
    if (!destinationUrl) {
      const matchedProd = db.products.find(
        (p) => p.id.startsWith(code) || p.externalId === code
      );
      if (matchedProd) {
        destinationUrl = matchedProd.affiliateUrl;
        store = matchedProd.storeName;
        productTitle = matchedProd.title;
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

  // 4. Registrar evento de clique no Supabase (não-bloqueante)
  if (isSupabaseConfigured && supabase) {
    const userAgent = req.headers.get('user-agent') || 'desconhecido';
    const referer = req.headers.get('referer') || req.headers.get('origin') || 'direto';

    void supabase
      .from('click_events')
      .insert({
        code,
        destination_url: destinationUrl,
        store: store || (destinationUrl.includes('mercadolivre') ? 'mercadolivre' : destinationUrl.includes('shopee') ? 'shopee' : destinationUrl.includes('amazon') ? 'amazon' : destinationUrl.includes('netshoes') ? 'netshoes' : 'outro'),
        user_agent: userAgent.slice(0, 255),
        referer: referer.slice(0, 255),
      })
      .then(() => {});
  }

  // 5. Redirecionamento temporário 307 para o link de afiliado oficial
  return NextResponse.redirect(destinationUrl, 307);
}
