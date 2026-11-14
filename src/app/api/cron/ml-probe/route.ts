import { NextRequest, NextResponse } from 'next/server';
import { checkCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';

/** TEMPORÁRIA (Assistente v1, Task 0): o ML deixa a Vercel ler a busca pública? Só devolve números. */
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  const q = (req.nextUrl.searchParams.get('q') || 'air fryer mondial 4 litros').trim().slice(0, 80);
  const slug = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const t0 = Date.now();
  const res = await fetch(`https://lista.mercadolivre.com.br/${slug}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Accept-Language': 'pt-BR' },
    signal: AbortSignal.timeout(20000),
  }).catch(e => ({ status: 0, url: '', text: async () => String(e?.message) } as any));
  const html: string = await res.text();
  return NextResponse.json({
    status: res.status,
    finalUrl: String(res.url || '').replace(/\?.*/, ''),
    ms: Date.now() - t0,
    bytes: html.length,
    cards: (html.match(/poly-card/g) || []).length,
    ratings: (html.match(/"rating_average":/g) || []).length,
    vendidos: (html.match(/vendidos/g) || []).length,
    captcha: /captcha|account-verification|suspicious/i.test(html.slice(0, 50000)),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
