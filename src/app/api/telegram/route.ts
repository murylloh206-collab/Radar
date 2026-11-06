import { NextRequest, NextResponse } from 'next/server';
import {
  getTelegramConnection,
  validateAndSaveTelegramConnection,
  disconnectTelegramConnection,
  sendOfferToTelegram,
} from '@/lib/server/telegram-service';
import { checkPlanFeatureAccess, resolveCurrentUserId } from '@/lib/server/plan-guard';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const [conn, access] = await Promise.all([
      getTelegramConnection(userId),
      checkPlanFeatureAccess('telegram_posting', userId),
    ]);

    return NextResponse.json({
      ok: true,
      allowed: access.allowed,
      requiredPlan: access.requiredPlan,
      connection: {
        userId: conn.userId,
        hasBotToken: Boolean(conn.botToken && conn.botToken.length > 5),
        maskedToken: conn.botToken
          ? `${conn.botToken.slice(0, 6)}...${conn.botToken.slice(-4)}`
          : '',
        botUsername: conn.botUsername,
        botName: conn.botName,
        chatId: conn.chatId,
        chatTitle: conn.chatTitle,
        isActive: conn.isActive,
        status: conn.status,
        lastVerifiedAt: conn.lastVerifiedAt,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'connect';

    const access = await checkPlanFeatureAccess('telegram_posting', userId);
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          error: access.error,
          requiredPlan: access.requiredPlan,
        },
        { status: 403 }
      );
    }

    if (action === 'connect') {
      const botToken = typeof body.botToken === 'string' ? body.botToken.trim() : '';
      const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';

      const res = await validateAndSaveTelegramConnection({
        userId,
        botToken,
        chatId,
      });

      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        connection: res.connection,
        message: `Bot ${res.connection?.botUsername || ''} conectado com sucesso ao chat "${res.connection?.chatTitle}"!`,
      });
    }

    if (action === 'disconnect') {
      const conn = await disconnectTelegramConnection(userId);
      return NextResponse.json({
        ok: true,
        connection: conn,
        message: 'Integração com Telegram desconectada.',
      });
    }

    if (action === 'send') {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : undefined;

      if (!text) {
        return NextResponse.json(
          { ok: false, error: 'O texto da postagem é obrigatório para envio ao Telegram.' },
          { status: 400 }
        );
      }

      const sendRes = await sendOfferToTelegram({ userId, text, imageUrl });
      if (!sendRes.ok) {
        return NextResponse.json({ ok: false, error: sendRes.error }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        messageId: sendRes.messageId,
        message: 'Oferta publicada no Telegram com sucesso!',
      });
    }

    return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

