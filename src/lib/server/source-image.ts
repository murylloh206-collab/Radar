import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** A mensagem do grupo de origem tem foto? (olha dentro de ephemeral/viewOnce também) */
export function messageHasImage(messageData: any): boolean {
  const m = messageData?.message || {};
  const inner = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m;
  return Boolean(inner?.imageMessage);
}

async function uploadToStorage(buffer: Buffer, path: string, contentType: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { error } = await supabase.storage.from('radar-media').upload(path, buffer, { contentType, upsert: true });
  if (error) return null;
  return supabase.storage.from('radar-media').getPublicUrl(path).data.publicUrl || null;
}

/**
 * Reserva para lojas que não deixam ler a página do produto (Amazon, Netshoes): baixa a foto da própria
 * mensagem de origem pela Evolution e salva no armazenamento. Sem foto ou com falha → undefined.
 */
export async function fetchSourceImageUrl(opts: {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  messageData: any;
  messageId: string;
  upload?: (buffer: Buffer, path: string, contentType: string) => Promise<string | null>;
}): Promise<string | undefined> {
  if (!messageHasImage(opts.messageData) || !opts.baseUrl || !opts.apiKey || !opts.instanceName) return undefined;
  try {
    const res = await fetch(`${opts.baseUrl.replace(/\/+$/, '')}/chat/getBase64FromMediaMessage/${encodeURIComponent(opts.instanceName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: opts.apiKey },
      body: JSON.stringify({ message: { key: opts.messageData.key, message: opts.messageData.message }, convertToMp4: false }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    const data: any = await res.json().catch(() => null);
    const base64 = String(data?.base64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!base64) return undefined;
    const mimetype = String(data?.mimetype || 'image/jpeg');
    if (!/^image\//.test(mimetype)) return undefined;
    const ext = mimetype.includes('png') ? 'png' : mimetype.includes('webp') ? 'webp' : 'jpg';
    const safeId = String(opts.messageId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || `msg${Date.now()}`;
    const url = await (opts.upload || uploadToStorage)(Buffer.from(base64, 'base64'), `copier-source/${safeId}.${ext}`, mimetype);
    return url || undefined;
  } catch {
    return undefined;
  }
}
