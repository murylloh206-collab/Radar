import { NextRequest, NextResponse } from 'next/server';
import { processIncomingMessage } from '@/lib/server/copier-service';
import { readDatabase } from '@/lib/server/storage';
import { requireAdminAuth } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await req.json();
    const { sourceGroupJid, text, senderName = 'Teste de Homologação' } = body;

    if (!sourceGroupJid) {
      return NextResponse.json(
        { ok: false, error: 'O grupo de origem é obrigatório para a verificação controlada.' },
        { status: 400 }
      );
    }

    const testText = (text || '').trim();
    if (!testText) {
      return NextResponse.json(
        { ok: false, error: 'Informe o conteúdo da mensagem com um link de produto para verificação.' },
        { status: 400 }
      );
    }

    const db = readDatabase();
    const source = db.sources.find((s) => s.groupJid === sourceGroupJid);

    if (!source) {
      return NextResponse.json(
        {
          ok: false,
          error: `O grupo ${sourceGroupJid} não está cadastrado como regra no Copiador. Cadastre uma regra primeiro.`,
        },
        { status: 400 }
      );
    }

    const testMessageId = `test_sim_${Date.now()}`;
    const simulatedPayload = {
      event: 'messages.upsert',
      instance: db.whatsapp.instanceName || 'radar_ofertas',
      data: {
        key: {
          remoteJid: sourceGroupJid,
          fromMe: false,
          id: testMessageId,
          participant: '5511999999999@s.whatsapp.net',
        },
        pushName: senderName,
        message: {
          conversation: testText,
        },
      },
    };

    // Executa a cadeia de verificação isolada (NUNCA gera publicação nem aciona worker)
    const result = await processIncomingMessage(simulatedPayload, { isSimulation: true });

    // Recarrega o banco para pegar a mensagem registrada
    const updatedDb = readDatabase();
    const registeredMsg = updatedDb.incomingMessages.find(
      (m) => m.messageId === testMessageId
    );

    return NextResponse.json({
      ok: true,
      result,
      source: {
        id: source.id,
        name: source.name,
        isActive: source.isActive,
        mode: source.operationMode,
      },
      registeredMessage: registeredMsg || null,
      message: result.accepted
        ? `Mensagem recebida e processada com sucesso no Copiador (${result.status}): ${result.reason}`
        : `Mensagem recebida e classificada (${result.status}): ${result.reason}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
