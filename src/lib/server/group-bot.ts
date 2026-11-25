import 'server-only';
import { unstable_cache } from 'next/cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { ADMIN_UUID } from '@/lib/server/auth';

/** Conversa com o bot já com "menu" escrito. Número inválido → null. */
export function botChatUrl(phone?: string | null): string | null {
  const digits = String(phone || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return /^\d{10,15}$/.test(digits) ? `https://wa.me/${digits}?text=menu` : null;
}

/** Conversa com o assistente da conta dona, só quando ele está ligado e o número conectado. Nunca lança. */
export async function findBotChatUrl(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: settings } = await supabase.from('assistant_settings').select('connection_id').eq('user_id', ADMIN_UUID).eq('enabled', true);
    const ids = (settings || []).map(s => s.connection_id);
    if (!ids.length) return null;
    const { data } = await supabase.from('whatsapp_connections').select('owner_jid, phone_number, status')
      .eq('user_id', ADMIN_UUID).in('id', ids).eq('status', 'connected').limit(1);
    return botChatUrl(data?.[0]?.owner_jid || data?.[0]?.phone_number);
  } catch { return null; }
}

/** Para a página /grupo (guardado por 10 min): mostra o botão do bot só quando ele funciona. */
export const botAvailable = unstable_cache(async () => Boolean(await findBotChatUrl()), ['grupo-bot-v1'], { revalidate: 600 });
