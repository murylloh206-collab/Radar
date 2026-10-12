import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "@/lib/server/config";
import { enqueueMeliShorten } from "@/lib/server/puppeteer-meli";
import { updateDatabase } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { cookie?: string };
    const rawCookie = (body.cookie || "").trim();

    if (!rawCookie) {
      return NextResponse.json({ error: "Cole o cookie de sessão do Mercado Livre." }, { status: 400 });
    }

    // 1. Atualiza em tempo de execução
    config.mercadoLivre.sessionCookie = rawCookie;

    // 2. Persiste em .env.local
    try {
      const envPath = path.resolve(process.cwd(), ".env.local");
      const currentEnv = await fs.readFile(envPath, "utf-8").catch(() => "");
      let updatedEnv = "";

      if (currentEnv.includes("ML_SESSION_COOKIE=")) {
        updatedEnv = currentEnv.replace(
          /ML_SESSION_COOKIE=(?:"[^"]*"|'[^']*'|[^\r\n]*)/,
          `ML_SESSION_COOKIE="${rawCookie.replace(/"/g, '\\"')}"`,
        );
      } else {
        updatedEnv = `${currentEnv}\nML_SESSION_COOKIE="${rawCookie.replace(/"/g, '\\"')}"\n`;
      }

      await fs.writeFile(envPath, updatedEnv, "utf-8");
    } catch (fsErr) {
      console.warn("[api/auth/cookie] Não foi possível salvar em .env.local:", fsErr);
    }

    // 3. Reseta ofertas que falharam por sessão expirada para nova tentativa
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
      message: `Cookie de sessão ativado com sucesso! ${resetCount} oferta(s) reencaminhada(s) para gerar meli.la.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar cookie de sessão.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
