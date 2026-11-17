import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { decryptSecret, encryptSecret } from '@/lib/server/crypto-vault';

/*
 * Sessão do conector próprio do WhatsApp guardada no banco, cifrada (AES-256-GCM via crypto-vault).
 * Mesmo formato do useMultiFileAuthState do Baileys, trocando arquivos por linhas de wa_gateway_auth.
 */

type Json = { replacer: (k: string, v: unknown) => unknown; reviver: (k: string, v: unknown) => unknown };

function db() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Banco de dados não configurado.');
  return supabase;
}

export async function loadAuthState(sessionId: string) {
  const baileys = await import('baileys');
  const json: Json = baileys.BufferJSON;
  const encode = (value: unknown) => encryptSecret(JSON.stringify(value, json.replacer));
  const decode = (value: string) => JSON.parse(decryptSecret(value) || 'null', json.reviver);

  const { data: credsRow, error } = await db().from('wa_gateway_auth').select('value')
    .eq('session_id', sessionId).eq('kind', 'creds').eq('key_id', 'creds').maybeSingle();
  if (error) throw new Error(`Não consegui ler a sessão do WhatsApp: ${error.message}`);
  const creds = credsRow?.value ? decode(credsRow.value) : baileys.initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type: string, ids: string[]) => {
        const result: Record<string, unknown> = {};
        if (!ids.length) return result;
        for (let i = 0; i < ids.length; i += 200) {
          const { data, error: readError } = await db().from('wa_gateway_auth').select('key_id, value')
            .eq('session_id', sessionId).eq('kind', type).in('key_id', ids.slice(i, i + 200));
          if (readError) throw new Error(`Falha ao ler chaves (${type}): ${readError.message}`);
          for (const row of data || []) {
            let value = decode(row.value);
            if (type === 'app-state-sync-key' && value) value = baileys.proto.Message.AppStateSyncKeyData.fromObject(value);
            result[row.key_id] = value;
          }
        }
        return result;
      },
      set: async (data: Record<string, Record<string, unknown>>) => {
        const upserts: { session_id: string; kind: string; key_id: string; value: string; updated_at: string }[] = [];
        const removals: { kind: string; ids: string[] }[] = [];
        const now = new Date().toISOString();
        for (const kind of Object.keys(data)) {
          const removed: string[] = [];
          for (const [keyId, value] of Object.entries(data[kind] || {})) {
            if (value) upserts.push({ session_id: sessionId, kind, key_id: keyId, value: encode(value), updated_at: now });
            else removed.push(keyId);
          }
          if (removed.length) removals.push({ kind, ids: removed });
        }
        for (let i = 0; i < upserts.length; i += 300) {
          const { error: writeError } = await db().from('wa_gateway_auth').upsert(upserts.slice(i, i + 300), { onConflict: 'session_id,kind,key_id' });
          if (writeError) throw new Error(`Falha ao gravar chaves: ${writeError.message}`);
        }
        for (const removal of removals) {
          await db().from('wa_gateway_auth').delete().eq('session_id', sessionId).eq('kind', removal.kind).in('key_id', removal.ids);
        }
      },
    },
  };

  const saveCreds = async () => {
    const { error: saveError } = await db().from('wa_gateway_auth').upsert(
      { session_id: sessionId, kind: 'creds', key_id: 'creds', value: encode(state.creds), updated_at: new Date().toISOString() },
      { onConflict: 'session_id,kind,key_id' },
    );
    if (saveError) throw new Error(`Falha ao salvar a sessão: ${saveError.message}`);
  };

  // Pareado por QR: o WhatsApp grava `me` nas credenciais (`registered` só vale para código de pareamento).
  return { state, saveCreds, isRegistered: Boolean(credsRow?.value && creds?.me?.id) };
}

/** Apaga a sessão inteira (desconectar). */
export async function clearAuthState(sessionId: string): Promise<void> {
  await db().from('wa_gateway_auth').delete().eq('session_id', sessionId);
}
