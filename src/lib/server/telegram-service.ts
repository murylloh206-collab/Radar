import fs from 'node:fs';
import path from 'node:path';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ADMIN_UUID } from './auth';
import { checkPlanFeatureAccess } from './plan-guard';

export interface TelegramConnectionRecord {
  userId: string;
  botToken: string;
  botUsername: string | null;
  botName: string | null;
  chatId: string;
  chatTitle: string | null;
  isActive: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastVerifiedAt: string | null;
  updatedAt: string;
}

const LOCAL_TELEGRAM_FILE = path.join(process.cwd(), '.data', 'telegram_connections.json');

function getDefaultTelegramRecord(userId: string = ADMIN_UUID): TelegramConnectionRecord {
  return {
    userId,
    botToken: '',
    botUsername: null,
    botName: null,
    chatId: '',
    chatTitle: null,
    isActive: false,
    status: 'disconnected',
    lastVerifiedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function readLocalTelegram(userId: string): TelegramConnectionRecord | null {
  try {
    if (fs.existsSync(LOCAL_TELEGRAM_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LOCAL_TELEGRAM_FILE, 'utf-8'));
      if (raw && raw[userId]) {
        return { ...getDefaultTelegramRecord(userId), ...raw[userId], userId };
      }
    }
  } catch {}
  return null;
}

function writeLocalTelegram(record: TelegramConnectionRecord): void {
  try {
    const dir = path.dirname(LOCAL_TELEGRAM_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let existing: Record<string, TelegramConnectionRecord> = {};
    if (fs.existsSync(LOCAL_TELEGRAM_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(LOCAL_TELEGRAM_FILE, 'utf-8')) || {};
      } catch {}
    }
    existing[record.userId] = record;
    fs.writeFileSync(LOCAL_TELEGRAM_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  } catch {}
}

export async function getTelegramConnection(userIdInput?: string): Promise<TelegramConnectionRecord> {
  const userId = userIdInput || ADMIN_UUID;
  const local = readLocalTelegram(userId);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('telegram_connections')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        const rec: TelegramConnectionRecord = {
          userId,
          botToken: data.bot_token || '',
          botUsername: data.bot_username || null,
          botName: data.bot_name || null,
          chatId: data.chat_id || '',
          chatTitle: data.chat_title || null,
          isActive: Boolean(data.is_active),
          status: (data.status as 'connected' | 'disconnected' | 'error') || 'disconnected',
          lastVerifiedAt: data.last_verified_at || null,
          updatedAt: data.updated_at || new Date().toISOString(),
        };
        writeLocalTelegram(rec);
        return rec;
      }
    } catch {}
  }

  return local || getDefaultTelegramRecord(userId);
}

/**
 * Valida o Bot Token e o Chat ID diretamente na API oficial do Telegram (api.telegram.org)
 */
export async function validateAndSaveTelegramConnection(params: {
  userId?: string;
  botToken: string;
  chatId: string;
}): Promise<{
  ok: boolean;
  error?: string;
  connection?: TelegramConnectionRecord;
}> {
  const userId = params.userId || ADMIN_UUID;
  const access = await checkPlanFeatureAccess('telegram_posting', userId);
  if (!access.allowed) {
    return {
      ok: false,
      error: access.error || 'A integração com o Telegram está disponível a partir do plano Plus.',
    };
  }

  const cleanToken = params.botToken.trim();
  const cleanChatId = params.chatId.trim();

  if (!cleanToken || !cleanToken.includes(':')) {
    return {
      ok: false,
      error: 'Informe um Bot Token válido gerado pelo @BotFather (formato: 123456789:ABCdef...).',
    };
  }

  if (!cleanChatId) {
    return {
      ok: false,
      error: 'Informe o Chat ID do canal ou grupo (ex: @meucanal ou -100123456789).',
    };
  }

  try {
    // 1. Verificar o Bot via getMe na API oficial do Telegram
    const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    const meData = await meRes.json().catch(() => ({}));

    if (!meRes.ok || !meData.ok || !meData.result) {
      return {
        ok: false,
        error: `Bot Token recusado pela API oficial do Telegram: ${meData.description || 'Token inválido'}.`,
      };
    }

    const botUsername = meData.result.username ? `@${meData.result.username}` : null;
    const botName = meData.result.first_name || 'Bot Telegram';

    // 2. Verificar se o Bot enxerga o Chat ID informado via getChat
    const chatRes = await fetch(
      `https://api.telegram.org/bot${cleanToken}/getChat?chat_id=${encodeURIComponent(cleanChatId)}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      }
    );
    const chatData = await chatRes.json().catch(() => ({}));

    if (!chatRes.ok || !chatData.ok || !chatData.result) {
      return {
        ok: false,
        error: `O bot ${botUsername || ''} não conseguiu acessar o chat "${cleanChatId}". Certifique-se de que o bot foi adicionado como Administrador no canal/grupo (${chatData.description || 'Chat não encontrado'}).`,
      };
    }

    const chatTitle =
      chatData.result.title ||
      chatData.result.username ||
      chatData.result.first_name ||
      cleanChatId;

    const record: TelegramConnectionRecord = {
      userId,
      botToken: cleanToken,
      botUsername,
      botName,
      chatId: cleanChatId,
      chatTitle,
      isActive: true,
      status: 'connected',
      lastVerifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    writeLocalTelegram(record);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('telegram_connections').upsert(
          {
            user_id: userId,
            bot_token: record.botToken,
            bot_username: record.botUsername,
            bot_name: record.botName,
            chat_id: record.chatId,
            chat_title: record.chatTitle,
            is_active: record.isActive,
            status: record.status,
            last_verified_at: record.lastVerifiedAt,
            updated_at: record.updatedAt,
          },
          { onConflict: 'user_id' }
        );
      } catch {}
    }

    return { ok: true, connection: record };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Erro de rede ao conectar à API oficial do Telegram: ${msg}`,
    };
  }
}

export async function disconnectTelegramConnection(userIdInput?: string): Promise<TelegramConnectionRecord> {
  const userId = userIdInput || ADMIN_UUID;
  const empty = getDefaultTelegramRecord(userId);
  writeLocalTelegram(empty);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('telegram_connections').delete().eq('user_id', userId);
    } catch {}
  }

  return empty;
}

/**
 * Envia uma postagem (com foto ou apenas texto) para o canal/grupo do Telegram via Bot API oficial.
 */
export async function sendOfferToTelegram(params: {
  userId?: string;
  text: string;
  imageUrl?: string;
}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const userId = params.userId || ADMIN_UUID;
  const access = await checkPlanFeatureAccess('telegram_posting', userId);
  if (!access.allowed) {
    return {
      ok: false,
      error: access.error || 'Postagem no Telegram disponível a partir do plano Plus.',
    };
  }

  const conn = await getTelegramConnection(userId);
  if (!conn.isActive || !conn.botToken || !conn.chatId || conn.status !== 'connected') {
    return {
      ok: false,
      error: 'Telegram não conectado. Configure seu Bot Token e Chat ID em Conexões → Canais.',
    };
  }

  try {
    if (params.imageUrl && params.imageUrl.startsWith('http')) {
      const photoRes = await fetch(
        `https://api.telegram.org/bot${conn.botToken}/sendPhoto`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: conn.chatId,
            photo: params.imageUrl,
            caption: params.text.slice(0, 1024),
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      const photoData = await photoRes.json().catch(() => ({}));
      if (photoRes.ok && photoData.ok) {
        return { ok: true, messageId: photoData.result?.message_id };
      }
      // Fallback para texto se a URL de imagem não puder ser baixada pelo servidor do Telegram
    }

    const textRes = await fetch(
      `https://api.telegram.org/bot${conn.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: conn.chatId,
          text: params.text,
          disable_web_page_preview: false,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    const textData = await textRes.json().catch(() => ({}));
    if (!textRes.ok || !textData.ok) {
      return {
        ok: false,
        error: `Falha ao enviar para o Telegram: ${textData.description || 'Erro na API do Telegram'}`,
      };
    }

    return { ok: true, messageId: textData.result?.message_id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Erro ao enviar oferta ao Telegram: ${msg}` };
  }
}
