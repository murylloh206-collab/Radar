import 'server-only';

/*
 * Aviso no celular do dono (app ntfy, tópico NTFY_TOPIC). Silencioso se não configurado; nunca lança.
 */
export interface OwnerNotice {
  title: string;
  body: string;
  tags?: string;
  priority?: 'min' | 'low' | 'default' | 'high' | 'urgent';
  click?: string;
}

/** Cabeçalhos HTTP só aceitam ASCII com segurança: títulos com acento vão em RFC 2047 (o ntfy decodifica). */
export function encodeNtfyHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export async function notifyOwner(notice: OwnerNotice, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const topic = (process.env.NTFY_TOPIC || '').trim();
  if (!topic) return false;
  const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').trim().replace(/\/$/, '');
  const headers: Record<string, string> = { Title: encodeNtfyHeader(notice.title) };
  if (notice.tags) headers.Tags = notice.tags;
  if (notice.priority) headers.Priority = notice.priority;
  if (notice.click) headers.Click = notice.click;
  try {
    const res = await fetchImpl(`${server}/${encodeURIComponent(topic)}`, {
      method: 'POST', headers, body: notice.body, signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
