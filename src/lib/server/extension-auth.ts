import 'server-only';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Vínculo extensão ↔ conta: o painel logado gera um código curto (10 min, uso único);
// a extensão troca o código por um token longo, revogável. O banco guarda só SHA-256.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 10 * 60_000;
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

interface CodeRow { codeHash: string; userId: string; expiresAt: number; usedAt: number | null }
interface TokenRow { tokenHash: string; userId: string; revokedAt: number | null }

export interface ExtensionAuthRepo {
  insertCode(row: CodeRow): Promise<void>;
  /** Marca o código como usado de forma atômica; devolve a linha só se ainda estava livre. */
  consumeCode(codeHash: string, now: number): Promise<CodeRow | null>;
  insertToken(row: TokenRow): Promise<void>;
  findToken(tokenHash: string): Promise<TokenRow | null>;
  touchToken(tokenHash: string): Promise<void>;
  revokeToken(tokenHash: string): Promise<void>;
}

export function memoryExtensionAuthRepo(): ExtensionAuthRepo & { dump(): unknown } {
  const codes = new Map<string, CodeRow>();
  const tokens = new Map<string, TokenRow>();
  return {
    async insertCode(row) { codes.set(row.codeHash, { ...row }); },
    async consumeCode(hash, now) {
      const row = codes.get(hash);
      if (!row || row.usedAt || row.expiresAt < now) return null;
      row.usedAt = now;
      return { ...row };
    },
    async insertToken(row) { tokens.set(row.tokenHash, { ...row }); },
    async findToken(hash) { const r = tokens.get(hash); return r ? { ...r } : null; },
    async touchToken() {},
    async revokeToken(hash) { const r = tokens.get(hash); if (r) r.revokedAt = Date.now(); },
    dump: () => ({ codes: [...codes.values()], tokens: [...tokens.values()] }),
  };
}

export function supabaseExtensionAuthRepo(): ExtensionAuthRepo {
  const db = () => {
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado.');
    return supabase;
  };
  return {
    async insertCode(row) {
      const { error } = await db().from('extension_pairing_codes').insert({
        code_hash: row.codeHash, user_id: row.userId, expires_at: new Date(row.expiresAt).toISOString(),
      });
      if (error) throw new Error(`Falha ao criar código: ${error.message}`);
    },
    async consumeCode(hash, now) {
      const { data, error } = await db()
        .from('extension_pairing_codes')
        .update({ used_at: new Date(now).toISOString() })
        .eq('code_hash', hash)
        .is('used_at', null)
        .gt('expires_at', new Date(now).toISOString())
        .select('code_hash,user_id,expires_at')
        .maybeSingle();
      if (error || !data) return null;
      return { codeHash: data.code_hash, userId: data.user_id, expiresAt: Date.parse(data.expires_at), usedAt: now };
    },
    async insertToken(row) {
      const { error } = await db().from('extension_tokens').insert({ token_hash: row.tokenHash, user_id: row.userId });
      if (error) throw new Error(`Falha ao criar token da extensão: ${error.message}`);
    },
    async findToken(hash) {
      const { data } = await db().from('extension_tokens').select('token_hash,user_id,revoked_at').eq('token_hash', hash).maybeSingle();
      return data ? { tokenHash: data.token_hash, userId: data.user_id, revokedAt: data.revoked_at ? Date.parse(data.revoked_at) : null } : null;
    },
    async touchToken(hash) {
      await db().from('extension_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', hash);
    },
    async revokeToken(hash) {
      await db().from('extension_tokens').update({ revoked_at: new Date().toISOString() }).eq('token_hash', hash);
    },
  };
}

let defaultRepo: ExtensionAuthRepo | null = null;
function repoOr(repo?: ExtensionAuthRepo): ExtensionAuthRepo {
  if (repo) return repo;
  if (!defaultRepo) defaultRepo = isSupabaseConfigured ? supabaseExtensionAuthRepo() : memoryExtensionAuthRepo();
  return defaultRepo;
}

const normalizeCode = (code: string) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function createPairingCode(
  userId: string,
  repo?: ExtensionAuthRepo,
  now: () => number = Date.now
): Promise<{ code: string; expiresAt: string }> {
  const bytes = crypto.randomBytes(8);
  const code = [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const expiresAt = now() + CODE_TTL_MS;
  await repoOr(repo).insertCode({ codeHash: sha(code), userId, expiresAt, usedAt: null });
  return { code, expiresAt: new Date(expiresAt).toISOString() };
}

export async function exchangePairingCode(
  code: string,
  repo?: ExtensionAuthRepo,
  now: () => number = Date.now
): Promise<{ token: string; userId: string } | null> {
  const normalized = normalizeCode(code);
  if (normalized.length !== 8) return null;
  const r = repoOr(repo);
  const row = await r.consumeCode(sha(normalized), now());
  if (!row) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  await r.insertToken({ tokenHash: sha(token), userId: row.userId, revokedAt: null });
  return { token, userId: row.userId };
}

export async function resolveExtensionUser(req: Request, repo?: ExtensionAuthRepo): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length < 20) return null;
  const r = repoOr(repo);
  const row = await r.findToken(sha(token)).catch(() => null);
  if (!row || row.revokedAt) return null;
  await r.touchToken(row.tokenHash).catch(() => {});
  return row.userId;
}

export async function revokeExtensionToken(token: string, repo?: ExtensionAuthRepo): Promise<void> {
  await repoOr(repo).revokeToken(sha(token));
}

export function extensionUnauthorized(): NextResponse {
  return NextResponse.json(
    { ok: false, code: 'EXTENSION_UNPAIRED', error: 'Reconecte a extensão ao painel.' },
    { status: 401 }
  );
}
