import crypto from 'crypto';
import { getSessionSecret } from './auth';

/**
 * Deriva uma chave de 256 bits (32 bytes) segura para AES-256-GCM.
 * Requer obrigatoriamente uma chave estável no ambiente (ENCRYPTION_KEY ou SESSION_SECRET).
 * NUNCA utiliza chave efêmera aleatória em memória para garantir persistência após reinício do servidor.
 */
export function getDerivedEncryptionKey(): Buffer {
  const rawKey =
    process.env.ENCRYPTION_KEY?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!rawKey || rawKey.length < 16) {
    throw new Error(
      'CRÍTICO: Chave de criptografia estável não configurada no ambiente (ENCRYPTION_KEY). Configure uma chave de pelo menos 32 caracteres no arquivo .env.local para permitir a recuperação de credenciais após reinício.'
    );
  }

  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Criptografa uma string usando AES-256-GCM com IV único e tag de autenticação
 * Formato serializado: enc:v1:{iv_hex}:{authTag_hex}:{cipherText_hex}
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';

  const key = getDerivedEncryptionKey();
  const iv = crypto.randomBytes(12); // IV padrão recomendado para AES-GCM (96 bits)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plainText, 'utf-8')),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descriptografa uma string encriptada no formato enc:v1:{iv}:{authTag}:{cipherText}
 */
export function decryptSecret(encryptedPayload?: string | null): string {
  if (!encryptedPayload) return '';

  // Se não estiver no formato enc:v1, não está criptografado (legado ou texto plano)
  if (!encryptedPayload.startsWith('enc:v1:')) {
    return encryptedPayload;
  }

  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 5) {
      throw new Error('Formato do payload encriptado inválido');
    }

    const ivHex = parts[2];
    const authTagHex = parts[3];
    const cipherTextHex = parts[4];

    const key = getDerivedEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(cipherTextHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Falha ao descriptografar segredo: ${msg}`);
  }
}

/**
 * Criptografa objeto arbitrário em JSON seguro
 */
export function encryptJson<T>(data: T): string {
  if (data === null || data === undefined) return '';
  return encryptSecret(JSON.stringify(data));
}

/**
 * Descriptografa objeto JSON seguro
 */
export function decryptJson<T>(encryptedPayload?: string | null): T | null {
  if (!encryptedPayload) return null;
  const raw = decryptSecret(encryptedPayload);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
