import { NextResponse } from "next/server";
import { config } from "@/lib/server/config";
import { enqueueMeliShorten } from "@/lib/server/puppeteer-meli";
import { saveEncryptedSession } from "@/lib/server/session-vault";
import { updateDatabase } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/cookie
 * Recebe a sessão do Mercado Livre, criptografa em AES-256-GCM e persiste de forma segura.
 * NUNCA salva em arquivos efêmeros de texto puro nem expõe cookies brutos em respostas.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      cookie?: string;
      provider?: "mercadolivre" | "shopee";
    };
    const rawCookie = (body.cookie || "").trim();
    const provider = body.provider || "mercadolivre";

    if (!rawCookie) {
      return NextResponse.json(
        { error: `Informe os dados de sessão para ${provider === "shopee" ? "a Shopee" : "o Mercado Livre"}.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    // Estima expiração padrão em 14 dias se não fornecida
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Salva de forma criptografada no Session Vault Server-Side (PostgreSQL app_metadata / cofre)
    await saveEncryptedSession(provider, {
      rawCookie,
      savedAt: now,
      expiresAt,
      lastValidatedAt: now,
      isValid: true,
    });

    if (provider === "mercadolivre") {
      // 2. Atualiza em tempo de execução somente na memória protegida do servidor
      config.mercadoLivre.sessionCookie = rawCookie;

      // 3. Reseta ofertas pendentes de meli.la que estavam com falha anterior
      let resetCount = 0;
      await updateDatabase((db) => {
        for (const o of db.offers) {
          if (!o.shortUrl && (o.shortUrlStatus === "falhou" || (o.shortUrlAttempts ?? 0) >= 2)) {
            o.shortUrlStatus = "pendente";
            o.shortUrlAttempts = 0;
            o.shortUrlError = null;
            resetCount++;
          }
        }
      });

      // 4. Aciona a fila segura em background
      enqueueMeliShorten();

      return NextResponse.json({
        ok: true,
        message: `Sessão do Mercado Livre criptografada e ativada com sucesso! ${resetCount} oferta(s) reencaminhada(s) para encurtamento meli.la.`,
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Sessão da Shopee criptografada e ativada com sucesso no cofre do servidor!",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao processar sessão.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
