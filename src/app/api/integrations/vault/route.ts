import { NextRequest, NextResponse } from 'next/server';
import { checkApiAuth } from '@/lib/server/auth';
import { getSafeVaultStatus } from '@/lib/server/credentials-vault';
import { listRecentEvidence } from '@/lib/server/link-evidence';

export async function GET(req: NextRequest) {
  const auth = checkApiAuth(req);
  if (!auth.authorized || !auth.session) {
    return auth.response!;
  }

  const userId = auth.session.userId;
  const [stores, recentEvidence] = await Promise.all([
    getSafeVaultStatus(userId),
    listRecentEvidence(userId, 30),
  ]);

  return NextResponse.json({
    ok: true,
    userId,
    stores,
    recentEvidence,
  });
}
