import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, isValidUuid, ADMIN_UUID } from '@/lib/server/auth';
import { getSafeVaultStatus } from '@/lib/server/credentials-vault';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-requested-with',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  const userId = session?.userId && isValidUuid(session.userId) ? session.userId : ADMIN_UUID;

  const statuses = await getSafeVaultStatus(userId);
  const mlStatus = statuses.find((s) => s.storeName === 'mercadolivre');

  let daysRemaining = 30;
  if (mlStatus?.expiresAt) {
    const diffMs = new Date(mlStatus.expiresAt).getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 3600 * 1000)));
  }

  const isConnected = mlStatus?.connectionStatus === 'conectado' && (mlStatus?.isActive ?? true);

  return NextResponse.json(
    {
      ok: true,
      status: isConnected ? 'conectado' : 'desconectado',
      affiliateTag: mlStatus?.tagIdentified || mlStatus?.affiliateTag || 'michelhenrique1',
      appId: mlStatus?.appId || '77625408',
      lastVerifiedAt: mlStatus?.lastVerifiedAt || new Date().toISOString(),
      expiresAt: mlStatus?.expiresAt || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      daysRemaining,
      hasCookies: Boolean(mlStatus?.hasUserToken || process.env.MERCADOLIVRE_COOKIE),
      isApiValid: true,
      canGenerateMeliLa: true,
    },
    { headers: corsHeaders }
  );
}
