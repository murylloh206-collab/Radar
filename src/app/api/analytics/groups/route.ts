import { NextResponse } from 'next/server';
import { readDatabase } from '@/lib/server/storage';

export async function GET() {
  try {
    const db = readDatabase();
    const groups = db.groups || [];

    // Calcular disparos reais enviados para cada grupo
    const groupAnalytics = groups.map((g) => {
      const messagesSent = db.jobs.filter(
        (j) => j.targetJid === g.groupJid && j.status === 'enviado'
      ).length;

      return {
        id: g.id,
        groupJid: g.groupJid,
        name: g.name,
        participantCount: g.participantCount || 0,
        isAdmin: g.isAdmin,
        isDestination: g.isDestination,
        isOrigin: g.isOrigin,
        messagesSent,
        lastSyncedAt: g.lastSyncedAt,
      };
    });

    return NextResponse.json({
      ok: true,
      groups: groupAnalytics,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
