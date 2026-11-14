import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/*
 * Foto da oferta do copiador dentro do template do cliente (Ultimate + fundo enviado).
 * Sem fundo, sem plano ou em qualquer falha → undefined (o copiador segue com a foto normal).
 */
export interface CopierTemplateDeps {
  allowed(userId: string): Promise<boolean>;
  loadBackground(userId: string): Promise<Buffer | null>;
  loadPhoto(url: string): Promise<Buffer>;
  upload(buffer: Buffer, path: string): Promise<string | null>;
}

async function defaultDeps(): Promise<CopierTemplateDeps> {
  const { checkPlanFeatureAccess } = await import('./plan-guard');
  const { loadCopierBackground } = await import('./brand-assets');
  const { fetchProductImage } = await import('./offer-art/fetch-image');
  return {
    allowed: async userId => (await checkPlanFeatureAccess('copier_template', userId)).allowed,
    loadBackground: loadCopierBackground,
    loadPhoto: fetchProductImage,
    async upload(buffer, path) {
      if (!isSupabaseConfigured || !supabase) return null;
      const { error } = await supabase.storage.from('radar-media').upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
      if (error) return null;
      return supabase.storage.from('radar-media').getPublicUrl(path).data.publicUrl || null;
    },
  };
}

export async function applyCopierTemplate(
  userId: string,
  photoUrl: string,
  messageId: string,
  deps?: CopierTemplateDeps
): Promise<string | undefined> {
  try {
    const d = deps || (await defaultDeps());
    if (!(await d.allowed(userId))) return undefined;
    const background = await d.loadBackground(userId);
    if (!background) return undefined;
    const product = await d.loadPhoto(photoUrl);
    const { renderCopierTemplate } = await import('./offer-art/copier-template');
    const jpg = await renderCopierTemplate({ background, product });
    const safeId = String(messageId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || `m${Date.now()}`;
    return (await d.upload(jpg, `copier-template/${userId}/${safeId}.jpg`)) || undefined;
  } catch {
    return undefined;
  }
}
