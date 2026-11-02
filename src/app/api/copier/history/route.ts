import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export interface CopiedOfferHistoryItem {
  id: string;
  title: string;
  priceOriginal?: string;
  priceCurrent: string;
  discountPct?: string;
  coupon?: string;
  store: string;
  mediaUrl: string;
  affiliateUrl: string;
  originalUrl?: string;
  targetName: string;
  targetJid: string;
  status: string;
  sentAt: string;
  createdAt: string;
  messageText: string;
  story?: {
    imageUrl?: string;
    publishedAt?: string;
    mediaId?: string;
    platform?: string;
  };
}

/**
 * Detecta a loja a partir de uma URL ou texto
 */
function detectStore(url?: string, text?: string): string {
  const combined = `${url || ''} ${text || ''}`.toLowerCase();
  if (combined.includes('mercadolivre') || combined.includes('mercadolibre') || combined.includes('meli.la')) {
    return 'Mercado Livre';
  }
  if (combined.includes('shopee') || combined.includes('shp.ee')) {
    return 'Shopee';
  }
  if (combined.includes('amazon') || combined.includes('amzn.to')) {
    return 'Amazon';
  }
  if (combined.includes('magazineluiza') || combined.includes('magalu')) {
    return 'Magazine Luiza';
  }
  if (combined.includes('aliexpress')) {
    return 'AliExpress';
  }
  if (combined.includes('shein')) {
    return 'Shein';
  }
  return 'Oferta';
}

/**
 * Extrai título, preços e cupom a partir do texto formatado da mensagem
 */
function parseOfferDetails(messageText: string, payload?: any) {
  let title = payload?.title || payload?.productTitle || '';
  let priceOriginal = payload?.priceOriginal || payload?.priceOld || '';
  let priceCurrent = payload?.priceCurrent || payload?.price || '';
  let discountPct = payload?.discountPct || '';
  let coupon = payload?.coupon || '';

  if (!title) {
    const lines = messageText.split('\n').map((l) => l.trim()).filter(Boolean);
    // Procurar linha cercada por asteriscos que não seja chamada promocional
    for (const line of lines) {
      if (
        line.startsWith('*') &&
        line.endsWith('*') &&
        !line.includes('OFERTA') &&
        !line.includes('ACHADINHO') &&
        !line.includes('Por apenas') &&
        !line.includes('Compre aqui')
      ) {
        title = line.replace(/^\*+|\*+$/g, '').trim();
        break;
      }
    }
    if (!title && lines.length > 1) {
      title = lines[1].replace(/^\*+|\*+$/g, '').trim();
    }
  }

  // Preço De
  if (!priceOriginal) {
    const deMatch = messageText.match(/De:\s*~?R?\$?\s*([0-9.,]+)~?/i);
    if (deMatch) priceOriginal = deMatch[1].trim();
  }

  // Preço Por
  if (!priceCurrent) {
    const porMatch = messageText.match(/Por\s*(?:apenas)?\s*R?\$?\s*([0-9.,]+)/i);
    if (porMatch) priceCurrent = porMatch[1].trim();
  }

  // Desconto %
  if (!discountPct) {
    const discMatch = messageText.match(/\(?[-−]?\s*([0-9]+)%\s*OFF\)?/i);
    if (discMatch) discountPct = discMatch[1].trim();
  }

  // Cupom
  if (!coupon) {
    const cupomMatch = messageText.match(/Cupom:\s*([A-Za-z0-9_-]+)/i);
    if (cupomMatch) coupon = cupomMatch[1].trim();
  }

  return {
    title: title || 'Produto em Oferta',
    priceOriginal,
    priceCurrent: priceCurrent || 'Confira o link',
    discountPct,
    coupon,
  };
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401, headers });
  }

  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json(
      { ok: false, error: 'Banco de dados Supabase indisponível.' },
      { status: 503, headers }
    );
  }

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));
  const statusFilter = searchParams.get('status') || 'todos';
  const querySearch = searchParams.get('search')?.trim().toLowerCase() || '';

  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('publication_jobs')
      .select('*', { count: 'exact' })
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'todos') {
      query = query.eq('status', statusFilter);
    }

    if (querySearch) {
      query = query.ilike('message_text', `%${querySearch}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: rows, count, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Falha ao carregar histórico: ${error.message}` },
        { status: 500, headers }
      );
    }

    const items: CopiedOfferHistoryItem[] = (rows || []).map((row) => {
      const payload = row.runtime_payload || {};
      const parsed = parseOfferDetails(row.message_text || '', payload);
      const store = detectStore(row.affiliate_url || row.original_url || '', row.message_text || '');

      return {
        id: row.id,
        title: parsed.title,
        priceOriginal: parsed.priceOriginal,
        priceCurrent: parsed.priceCurrent,
        discountPct: parsed.discountPct,
        coupon: parsed.coupon,
        store,
        mediaUrl: row.media_url || payload.mediaUrl || '',
        affiliateUrl: row.affiliate_url || payload.affiliateUrl || '',
        originalUrl: row.original_url || payload.originalUrl || '',
        targetName: row.target_name || row.target_jid || 'Grupo de WhatsApp',
        targetJid: row.target_jid || '',
        status: row.status,
        sentAt: row.sent_at || row.updated_at || row.created_at,
        createdAt: row.created_at,
        messageText: row.message_text || '',
        story: payload.story || undefined,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        items,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
      { headers }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro ao processar consulta de histórico.' },
      { status: 500, headers }
    );
  }
}
