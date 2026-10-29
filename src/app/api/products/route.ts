import { NextRequest, NextResponse } from 'next/server';
import { readDatabase } from '@/lib/server/storage';

export async function GET(req: NextRequest) {
  try {
    const db = readDatabase();
    const store = req.nextUrl.searchParams.get('store');
    const search = req.nextUrl.searchParams.get('search');

    let products = db.products || [];

    if (store && store !== 'todas') {
      products = products.filter((p) => p.storeName === store);
    }

    if (search && search.trim().length > 0) {
      const q = search.toLowerCase();
      products = products.filter((p) => p.title.toLowerCase().includes(q));
    }

    return NextResponse.json({
      ok: true,
      products,
      total: products.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
