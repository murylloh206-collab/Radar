import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { checkPlanFeatureAccess } from '@/lib/server/plan-guard';
import { saveBrandSettings } from '@/lib/server/brand-settings';
import {
  BrandAssetError,
  MAX_ASSET_BYTES,
  normalizeBrandAsset,
  removeStoryBackground,
  saveBrandAsset,
  storyBackgroundUrl,
  validateAssetKind,
} from '@/lib/server/brand-assets';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const unauthorized = () => NextResponse.json({ ok: false, error: 'Entre na sua conta.', code: 'UNAUTHORIZED' }, { status: 401 });

/** Situação das imagens da marca: fundo do story atual e se o plano permite o template. */
export async function GET(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return unauthorized();
  const access = await checkPlanFeatureAccess('story_template', session.userId);
  return NextResponse.json({
    ok: true,
    storyTemplateAllowed: access.allowed,
    storyTemplateMessage: access.allowed ? null : access.error,
    storyBackgroundUrl: access.allowed ? await storyBackgroundUrl(session.userId).catch(() => null) : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Envio de imagem pelo computador (arrastar ou escolher): logo ou fundo do story. */
export async function POST(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return unauthorized();
  try {
    const form = await req.formData();
    const kind = validateAssetKind(form.get('kind'));
    const file = form.get('file');
    if (!kind) return NextResponse.json({ ok: false, error: 'Tipo de imagem inválido.' }, { status: 400 });
    if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ ok: false, error: 'Nenhuma imagem enviada.' }, { status: 400 });
    if (file.size > MAX_ASSET_BYTES) return NextResponse.json({ ok: false, error: 'A imagem passa de 8 MB. Envie uma versão menor.' }, { status: 400 });
    if (kind === 'story_background') {
      const access = await checkPlanFeatureAccess('story_template', session.userId);
      if (!access.allowed) return NextResponse.json({ ok: false, error: access.error }, { status: 403 });
    }
    const normalized = await normalizeBrandAsset(kind, Buffer.from(await file.arrayBuffer()));
    const url = await saveBrandAsset(session.userId, kind, normalized);
    if (kind === 'logo') await saveBrandSettings(session.userId, { panelLogoUrl: url } as any);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const status = e instanceof BrandAssetError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Não consegui salvar a imagem.' }, { status });
  }
}

/** Remove o fundo do story (volta para a arte padrão). */
export async function DELETE(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return unauthorized();
  if (validateAssetKind(req.nextUrl.searchParams.get('kind')) !== 'story_background') {
    return NextResponse.json({ ok: false, error: 'Só o fundo do story pode ser removido aqui.' }, { status: 400 });
  }
  await removeStoryBackground(session.userId).catch(() => {});
  return NextResponse.json({ ok: true });
}
