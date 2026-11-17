import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getStrictSession } from '@/lib/server/auth';
import { pairGateway } from '@/lib/server/wa-gateway/group-status';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * Pareamento por QR em tempo real (Server-Sent Events). A conexão fica aberta enquanto o cliente
 * escaneia; cada QR novo do WhatsApp é enviado como imagem. Encerra em "ok" ou "erro".
 */
export async function POST(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Entre na sua conta.' }, { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { closed = true; }
      };
      const keepAlive = setInterval(() => send('ping', {}), 15_000);
      try {
        const { phone } = await pairGateway(session.userId, qr => {
          void QRCode.toDataURL(qr, { margin: 1, width: 320 }).then(image => send('qr', { image })).catch(() => undefined);
        });
        send('ok', { phone });
      } catch (error) {
        send('erro', { message: error instanceof Error ? error.message : 'Falha no pareamento.' });
      } finally {
        clearInterval(keepAlive);
        closed = true;
        try { controller.close(); } catch { /* já fechado */ }
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive' },
  });
}
