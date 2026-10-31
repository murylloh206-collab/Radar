import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface PublicPageConfig {
  title: string;
  bio: string;
  slug: string;
  btn1Text: string;
  btn1Url: string;
  btn2Text: string;
  btn2Url: string;
  updatedAt: string;
}

const DEFAULT_CONFIG: PublicPageConfig = {
  title: 'Radar de Ofertas',
  bio: 'Achados que valem a pena. Ofertas de tecnologia, casa e conforto, selecionadas para você.',
  slug: 'radar-ofertas',
  btn1Text: 'Entrar no grupo de ofertas',
  btn1Url: 'https://chat.whatsapp.com/exemplo',
  btn2Text: 'Conhecer as lojas',
  btn2Url: '',
  updatedAt: new Date().toISOString(),
};

function getFilePath(): string {
  const dir = path.join(process.cwd(), '.data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'public_page.json');
}

export async function GET() {
  try {
    const file = getFilePath();
    if (!fs.existsSync(file)) {
      return NextResponse.json({ ok: true, data: DEFAULT_CONFIG });
    }
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config: PublicPageConfig = {
      title: body.title || DEFAULT_CONFIG.title,
      bio: body.bio || DEFAULT_CONFIG.bio,
      slug: (body.slug || DEFAULT_CONFIG.slug).toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-'),
      btn1Text: body.btn1Text || DEFAULT_CONFIG.btn1Text,
      btn1Url: body.btn1Url || '',
      btn2Text: body.btn2Text || DEFAULT_CONFIG.btn2Text,
      btn2Url: body.btn2Url || '',
      updatedAt: new Date().toISOString(),
    };

    const file = getFilePath();
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');

    return NextResponse.json({ ok: true, data: config });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

