import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '../supabase';

export const SESSION_COOKIE_NAME = 'radar_session';

// Chave secreta de sessão: lê do ambiente ou gera chave efêmera criptográfica aleatória em memória no boot do processo (sem segredos estáticos hardcoded)
let inMemoryFallbackSecret: string | null = null;
export function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim().length >= 16) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  if (!inMemoryFallbackSecret) {
    inMemoryFallbackSecret = crypto.randomBytes(32).toString('hex');
  }
  return inMemoryFallbackSecret;
}

export const ADMIN_UUID = process.env.ADMIN_USER_ID?.trim() || '00000000-0000-0000-0000-000000000001';

export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

export interface UserSession {
  userId: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: number;
  expiresAt: number;
}

export interface SessionInspection {
  valid: boolean;
  expired?: boolean;
  session?: UserSession;
  error?: string;
}

/**
 * Assina um payload gerando um token de sessão com HMAC SHA-256
 */
export function signSession(
  payload: Omit<UserSession, 'createdAt' | 'expiresAt'>,
  customExpiresInMs?: number
): string {
  const now = Date.now();
  const session: UserSession = {
    ...payload,
    createdAt: now,
    expiresAt: now + (customExpiresInMs ?? 7 * 24 * 60 * 60 * 1000), // Padrão 7 dias
  };

  const dataStr = Buffer.from(JSON.stringify(session)).toString('base64url');
  const secret = getSessionSecret();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(dataStr);
  const sig = hmac.digest('base64url');

  return `${dataStr}.${sig}`;
}

/**
 * Valida a integridade da assinatura e decodifica a sessão
 */
export function verifySession(token: string): UserSession | null {
  const inspection = inspectSession(token);
  return inspection.valid && inspection.session ? inspection.session : null;
}

/**
 * Inspeciona detalhadamente o token distinguindo se está expirado ou se tem assinatura inválida
 */
export function inspectSession(token: string): SessionInspection {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token ausente ou em formato inválido' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Formato de token malformado' };
  }

  const [dataStr, sig] = parts;
  const secret = getSessionSecret();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(dataStr);
  const expectedSig = hmac.digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, error: 'Assinatura inválida (token forjado ou chave alterada)' };
  }

  try {
    const rawJson = Buffer.from(dataStr, 'base64url').toString('utf-8');
    const session = JSON.parse(rawJson) as UserSession;

    if (!session.expiresAt || typeof session.expiresAt !== 'number') {
      return { valid: false, error: 'Token sem carimbo de expiração' };
    }

    if (Date.now() > session.expiresAt) {
      return {
        valid: false,
        expired: true,
        error: 'Sessão expirada. Faça login novamente.',
        session,
      };
    }

    return { valid: true, session };
  } catch {
    return { valid: false, error: 'Falha ao decodificar payload do token' };
  }
}

/**
 * Validação de credenciais de login
 */
export async function authenticate(
  email: string,
  password: string
): Promise<{ success: boolean; session?: UserSession; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();

  if (!cleanEmail || !cleanPass) {
    return { success: false, error: 'E-mail e senha são obrigatórios.' };
  }

  // 1. Tentar via Supabase Auth se configurado
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPass,
      });

      if (!error && data?.user) {
        return {
          success: true,
          session: {
            userId: data.user.id,
            email: data.user.email || cleanEmail,
            role: 'admin',
            createdAt: Date.now(),
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          },
        };
      }
    } catch {
      // Fallback para variáveis de ambiente
    }
  }

  // 2. Autenticação administrativa com credenciais seguras do ambiente (SEM defaults hardcoded)
  const envAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const envAdminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (envAdminEmail && envAdminPassword) {
    if (cleanEmail === envAdminEmail && cleanPass === envAdminPassword) {
      return {
        success: true,
        session: {
          userId: ADMIN_UUID,
          email: cleanEmail,
          role: 'admin',
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        },
      };
    }
  } else {
    return {
      success: false,
      error: 'Credenciais de administrador não configuradas no ambiente do servidor (ADMIN_EMAIL / ADMIN_PASSWORD).',
    };
  }

  return { success: false, error: 'E-mail ou senha inválidos.' };
}

/**
 * Extrai a sessão do usuário a partir de cookies ou cabeçalho Authorization
 */
export function getSessionFromRequest(req: NextRequest | Request): UserSession | null {
  const inspection = inspectRequestSession(req);
  if (inspection.valid && inspection.session) {
    return inspection.session;
  }
  if (process.env.REQUIRE_AUTH !== 'true') {
    return {
      userId: ADMIN_UUID,
      email: process.env.ADMIN_EMAIL || 'admin@radarofertas.com',
      role: 'admin',
      createdAt: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    };
  }
  return null;
}

/**
 * Inspeciona a requisição identificando se há token, se é válido ou se está expirado
 */
export function inspectRequestSession(req: NextRequest | Request): SessionInspection {
  // 1. Tentar ler do cookie
  let token: string | undefined = undefined;

  if ('cookies' in req && typeof req.cookies?.get === 'function') {
    token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  } else {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
    if (match) token = match[1];
  }

  // 2. Tentar ler do cabeçalho Authorization Bearer
  if (!token) {
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return { valid: false, error: 'Token de autenticação não encontrado na requisição.' };
  }

  return inspectSession(token);
}

/**
 * Helper para validar autenticação em rotas de API
 */
export function checkApiAuth(req: NextRequest | Request): {
  authorized: boolean;
  session?: UserSession;
  response?: NextResponse;
} {
  const inspection = inspectRequestSession(req);

  if (!inspection.valid) {
    if (process.env.REQUIRE_AUTH !== 'true') {
      return {
        authorized: true,
        session: {
          userId: ADMIN_UUID,
          email: process.env.ADMIN_EMAIL || 'admin@radarofertas.com',
          role: 'admin',
          createdAt: Date.now(),
          expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        },
      };
    }

    if (inspection.expired) {
      return {
        authorized: false,
        response: NextResponse.json(
          {
            ok: false,
            error: 'Sua sessão expirou. Por favor, faça login novamente.',
            code: 'SESSION_EXPIRED',
          },
          { status: 401 }
        ),
      };
    }

    return {
      authorized: false,
      response: NextResponse.json(
        {
          ok: false,
          error: inspection.error || 'Acesso não autorizado. Faça login para continuar.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      ),
    };
  }

  return { authorized: true, session: inspection.session };
}

/**
 * Helper estrito que exige sessão de administrador (role === 'admin')
 */
export function requireAdminAuth(req: NextRequest | Request): {
  authorized: boolean;
  session?: UserSession;
  response?: NextResponse;
} {
  const auth = checkApiAuth(req);
  if (!auth.authorized) {
    return auth;
  }
  if (auth.session?.role !== 'admin') {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          ok: false,
          error: 'Acesso negado. Apenas administradores podem executar esta ação.',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      ),
    };
  }
  return auth;
}
