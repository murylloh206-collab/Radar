/**
 * Utilitário de inspeção de sessão 100% compatível com Edge Runtime do Next.js.
 * Não utiliza 'node:crypto', utilizando a Web Crypto API nativa (globalThis.crypto.subtle).
 */

export interface EdgeSessionPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: number;
  expiresAt: number;
}

export interface EdgeSessionInspection {
  valid: boolean;
  expired?: boolean;
  session?: EdgeSessionPayload;
  error?: string;
}

export const SESSION_COOKIE_NAME = 'radar_session';

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function base64UrlToUint8Array(str: string): Uint8Array {
  const binary = base64UrlDecode(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Inspeciona token de sessão de forma assíncrona compatível com Edge Runtime
 */
export async function inspectSessionEdge(
  token?: string | null,
  secretStr?: string
): Promise<EdgeSessionInspection> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token não fornecido.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Formato de token inválido.' };
  }

  const [dataStr, signatureStr] = parts;

  let session: EdgeSessionPayload;
  try {
    const jsonStr = base64UrlDecode(dataStr);
    session = JSON.parse(jsonStr) as EdgeSessionPayload;
  } catch {
    return { valid: false, error: 'Falha ao decodificar payload.' };
  }

  // 1. Verificar expiração temporal
  if (!session.expiresAt || Date.now() > session.expiresAt) {
    return { valid: false, expired: true, error: 'Sessão expirada.' };
  }

  // 2. Se a chave secreta foi fornecida, verificar assinatura criptográfica via Web Crypto API
  const secret = secretStr || process.env.SESSION_SECRET;
  if (secret && typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const keyData = enc.encode(secret);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const dataBytes = enc.encode(dataStr);
      const signatureBytes = base64UrlToUint8Array(signatureStr);

      const isValidSignature = await crypto.subtle.verify(
        'HMAC',
        cryptoKey,
        signatureBytes as unknown as BufferSource,
        dataBytes as unknown as BufferSource
      );

      if (!isValidSignature) {
        return { valid: false, error: 'Assinatura criptográfica inválida.' };
      }
    } catch {
      return { valid: false, error: 'Falha na validação da assinatura.' };
    }
  }

  return { valid: true, session };
}
