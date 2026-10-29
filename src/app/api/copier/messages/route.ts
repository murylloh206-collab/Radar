import { NextRequest, NextResponse } from 'next/server';
import { readDatabase } from '@/lib/server/storage';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const store = searchParams.get('store');
    const sourceJid = searchParams.get('sourceJid');
    const realOnly = searchParams.get('realOnly') === 'true';

    const db = readDatabase();
    const groupsMap = new Map<string, string>();
    (db.groups || []).forEach((g) => groupsMap.set(g.groupJid, g.name));
    (db.sources || []).forEach((s) => {
      if (!groupsMap.has(s.groupJid)) groupsMap.set(s.groupJid, s.name);
    });

    let list = [...db.incomingMessages];

    if (realOnly) {
      list = list.filter((m) => !m.isSimulation);
    }
    if (sourceJid) {
      list = list.filter((m) => m.remoteJid === sourceJid);
    }
    if (status) {
      list = list.filter((m) => m.status === status);
    }
    if (store) {
      list = list.filter((m) => m.extractedStore === store);
    }

    // Ordenar das mais recentes para as mais antigas
    list.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

    // Enriquecer com nome do grupo e job associado
    const enrichedMessages = list.map((msg) => {
      const relatedJob = db.jobs.find((j) => j.incomingMessageId === msg.id);
      return {
        ...msg,
        originGroupName: groupsMap.get(msg.remoteJid) || msg.remoteJid,
        publicationStatus: relatedJob ? relatedJob.status : undefined,
        publicationJobId: relatedJob ? relatedJob.id : undefined,
      };
    });

    return NextResponse.json({
      ok: true,
      messages: enrichedMessages,
      total: enrichedMessages.length,
      evaluations: db.evaluations,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
