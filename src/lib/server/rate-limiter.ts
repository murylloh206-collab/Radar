import 'server-only';
/**
 * Limitador de requisições (Rate Limiter em memória por IP) para rotas públicas:
 * - `/r/[code]` (redirecionador de links de afiliado)
 * - `/@slug` / `/u/[slug]` (vitrine pública "link na bio")
 */

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

export function checkPublicRouteRateLimit(
  req: Request,
  scope: 'redirect' | 'storefront' = 'redirect',
  maxRequestsPerMinute: number = 90
): RateLimitResult {
  const now = Date.now();
  const windowMs = 60 * 1000;

  // Limpeza periódica de buckets expirados
  if (buckets.size > 5000) {
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const ip =
    (forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip')) ||
    '127.0.0.1';

  const key = `${scope}::${ip}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxRequestsPerMinute - 1,
      resetInSeconds: 60,
    };
  }

  if (current.count >= maxRequestsPerMinute) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, maxRequestsPerMinute - current.count),
    resetInSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

