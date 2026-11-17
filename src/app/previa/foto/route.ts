import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/** Fotos do antes/depois guardadas em .previa/shots. Só na prévia local; em produção responde 404. */
export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_PREVIA !== '1' || process.env.NODE_ENV !== 'development') return new NextResponse(null, { status: 404 });
  const name = req.nextUrl.searchParams.get('f') || '';
  if (!/^(atual|novo)\/[A-Za-z0-9_-]+\.jpg$/.test(name)) return new NextResponse(null, { status: 404 });
  const file = path.join(process.cwd(), '.previa', 'shots', name);
  if (!fs.existsSync(file)) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
}
