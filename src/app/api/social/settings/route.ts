import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { getAutopostSettings, getSocialQuota, saveAutopostSettings } from '@/lib/server/social-posts';
import { getBrandSettings, saveBrandSettings } from '@/lib/server/brand-settings';

export const dynamic = 'force-dynamic';

async function identityOf(userId: string) {
  const brand = await getBrandSettings(userId);
  return { panelName: brand.panelName, watermarkHandle: brand.watermarkHandle, panelLogoUrl: brand.panelLogoUrl, accentColor: brand.accentColor, artBackground: brand.artBackground };
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login para continuar.' }, { status: 401 });
  const [settings, identity] = await Promise.all([getAutopostSettings(session.userId), identityOf(session.userId)]);
  return NextResponse.json({ ok: true, settings, identity }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Salva o automático e/ou a identidade visual das artes (somente do cliente logado; exige Plus ou superior). */
export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login para continuar.' }, { status: 401 });
  let body: { autopost?: Record<string, unknown>; identity?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 }); }
  const quota = await getSocialQuota(session.userId);
  if (quota.limit === 0) return NextResponse.json({ ok: false, error: quota.reason }, { status: 403 });
  try {
    const settings = body.autopost ? await saveAutopostSettings(session.userId, body.autopost) : await getAutopostSettings(session.userId);
    if (body.identity) {
      const id = body.identity;
      if (typeof id.panelLogoUrl === 'string' && id.panelLogoUrl.trim() && !/^https:\/\//i.test(id.panelLogoUrl.trim())) {
        return NextResponse.json({ ok: false, error: 'O link do logo precisa começar com https://' }, { status: 400 });
      }
      const handle = typeof id.watermarkHandle === 'string' ? id.watermarkHandle.trim() : undefined;
      const logo = typeof id.panelLogoUrl === 'string' ? id.panelLogoUrl.trim() : undefined;
      await saveBrandSettings(session.userId, {
        panelName: typeof id.panelName === 'string' ? id.panelName : undefined,
        watermarkHandle: handle ? (handle.startsWith('@') ? handle : `@${handle}`).slice(0, 40) : undefined,
        panelLogoUrl: logo === undefined ? undefined : /^https:\/\//i.test(logo) ? logo.slice(0, 500) : null,
        accentColor: typeof id.accentColor === 'string' ? id.accentColor : undefined,
        artBackground: id.artBackground === 'light' ? 'light' : id.artBackground === 'dark' ? 'dark' : undefined,
      });
    }
    return NextResponse.json({ ok: true, settings, identity: await identityOf(session.userId) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível salvar.' }, { status: 500 });
  }
}
