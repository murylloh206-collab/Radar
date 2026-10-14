import "server-only";

import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { config } from "./config";
import { generateMeliShortLinkDetailed } from "./meli-shortener";
import { loadDecryptedSession } from "./session-vault";
import { readDatabase, updateDatabase } from "./storage";

/**
 * FILA SEGURA DE ENCURTAMENTO MELI.LA
 * -----------------------------------
 * - Processa UMA oferta por vez (fila serial).
 * - Tenta geração imediata via API interna de afiliados; se precisar, aciona Puppeteer em lote.
 * - Abre o navegador 1 única vez por lote e fecha após terminar ou 30s inativo.
 * - Máximo de 2 tentativas por oferta.
 * - NUNCA gera link comum como se fosse afiliado: se falhar, preserva o link oficial de rastreamento.
 * - Utiliza perfil persistente (userDataDir) para preservação de cache e cookies de sessão.
 */

function parseCookies(rawCookieStr: string) {
  if (!rawCookieStr) return [];
  return rawCookieStr
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const idx = c.indexOf("=");
      if (idx === -1) return null;
      const name = c.slice(0, idx).trim();
      const value = c.slice(idx + 1).trim();
      return {
        name,
        value,
        domain: ".mercadolivre.com.br",
        path: "/",
      };
    })
    .filter((c): c is { name: string; value: string; domain: string; path: string } => c !== null);
}

class MeliQueueManager {
  private browser: Browser | null = null;
  private isProcessing = false;
  private closeTimer: NodeJS.Timeout | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    if (!this.browser || !this.browser.connected) {
      const profileDir = process.env.VERCEL
        ? path.join("/tmp", ".puppeteer_meli_profile")
        : path.resolve(process.cwd(), "data", ".puppeteer_meli_profile");

      this.browser = await puppeteer.launch({
        headless: true,
        userDataDir: profileDir,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
        ],
      });
    }

    return this.browser;
  }

  private scheduleClose() {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(async () => {
      if (this.browser) {
        try {
          await this.browser.close();
        } catch {
          // ignore
        }
        this.browser = null;
        console.log("[MeliQueue] Navegador fechado por inatividade (30s).");
      }
    }, 30000);
  }

  public async triggerQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    let processedCount = 0;
    const MAX_QUEUE_PER_RUN = 5;

    try {
      while (processedCount < MAX_QUEUE_PER_RUN) {
        const db = await readDatabase();
        // Localiza a primeira oferta pendente de encurtamento com até 2 tentativas
        const target = db.offers.find(
          (o) =>
            o.affiliateUrl &&
            !o.shortUrl &&
            o.shortUrlStatus !== "falhou" &&
            (o.shortUrlAttempts ?? 0) < 2,
        );

        if (!target) {
          break; // Nenhum item pendente
        }

        await this.processItem(target.id, target.originalUrl, target.externalId);
        processedCount++;
      }
    } finally {
      this.isProcessing = false;
      this.scheduleClose();
    }
  }

  private async processItem(offerId: string, productUrl: string, externalId?: string) {
    let cookieStr = config.mercadoLivre.sessionCookie;
    if (!cookieStr) {
      const session = await loadDecryptedSession("mercadolivre");
      if (session?.rawCookie) {
        cookieStr = session.rawCookie;
        config.mercadoLivre.sessionCookie = session.rawCookie;
      }
    }

    // Marca como gerando e incrementa tentativa
    await updateDatabase((db) => {
      const idx = db.offers.findIndex((o) => o.id === offerId);
      if (idx !== -1) {
        db.offers[idx].shortUrlStatus = "gerando";
        db.offers[idx].shortUrlAttempts = (db.offers[idx].shortUrlAttempts ?? 0) + 1;
      }
    });

    // 1. Tenta a geração rápida autenticada primeiro (sem abrir o navegador)
    const cleanId = (externalId || "").replace(/^MLB-?/, "");
    const fallbacks = cleanId
      ? [
          `https://produto.mercadolivre.com.br/MLB-${cleanId}`,
          `https://produto.mercadolivre.com.br/MLB${cleanId}`,
        ]
      : [];
    const direct = await generateMeliShortLinkDetailed(productUrl, undefined, fallbacks);
    if (direct.shortUrl) {
      const now = new Date().toISOString();
      await updateDatabase((db) => {
        const idx = db.offers.findIndex((o) => o.id === offerId);
        if (idx !== -1) {
          db.offers[idx].shortUrl = direct.shortUrl;
          db.offers[idx].shortUrlStatus = "pronto";
          db.offers[idx].shortUrlGeneratedAt = now;
          db.offers[idx].shortUrlError = null;
          if (cleanId && db.offers[idx].originalUrl.includes("/p/MLB")) {
            db.offers[idx].originalUrl = `https://produto.mercadolivre.com.br/MLB-${cleanId}`;
          }
        }
      });
      return;
    }

    // Se estiver em ambiente serverless (Vercel), nunca lance o Puppeteer local pois causará timeout 504
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      await updateDatabase((db) => {
        const idx = db.offers.findIndex((o) => o.id === offerId);
        if (idx !== -1) {
          db.offers[idx].shortUrlStatus = "falhou";
          db.offers[idx].shortUrlError = direct.error || "Item não elegível para link meli.la curto";
        }
      });
      return;
    }

    let shortUrl: string | null = null;
    let errorMessage: string | null = direct.error;
    let page: Page | null = null;

    if (!errorMessage && !cookieStr) {
      errorMessage = "Cookie de sessão não configurado no painel.";
    }

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      );

      const cookies = parseCookies(cookieStr);
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
      }

      await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

      // Avalia no contexto do navegador logado
      const inPageResult = await page.evaluate(async (pUrl, tag) => {
        try {
          const res = await fetch("/affiliate-program/api/v2/stripe/user/links", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/plain, */*",
            },
            body: JSON.stringify({ url: pUrl, tag }),
          });
          if (res.status === 401) {
            return { error: "Sessão do Mercado Livre expirou (401). Atualize o Cookie de Sessão no painel." };
          }
          const data = (await res.json().catch(() => ({}))) as { short_url?: string };
          if (data.short_url) return { shortUrl: data.short_url };
          return { error: "Link meli.la não retornado na página." };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Erro interno" };
        }
      }, productUrl, config.mercadoLivre.affiliateMattWord || "michelhenrique1");

      if (inPageResult.shortUrl) {
        shortUrl = inPageResult.shortUrl;
      } else if (inPageResult.error) {
        errorMessage = inPageResult.error;
      }

      // Escuta respostas de rede do Mercado Livre
      page.on("response", async (res) => {
        try {
          const u = res.url();
          if (u.includes("/stripe/user/links") || u.includes("/affiliate-program")) {
            const json = (await res.json()) as { short_url?: string };
            if (json.short_url && json.short_url.includes("meli.la")) {
              shortUrl = json.short_url;
            }
          }
        } catch {
          // ignore
        }
      });

      const shareButtons = [
        'button[aria-label*="Compartilhar"]',
        'button:has-text("Compartilhar")',
        '.ui-pdp-share__button',
        '.affiliate-stripe__button',
        '[data-testid="affiliate-share-button"]',
      ];

      for (const sel of shareButtons) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            await new Promise((r) => setTimeout(r, 1500));
            break;
          }
        } catch {
          // try next
        }
      }

      // Se não pegou via rede, verifica no DOM
      if (!shortUrl) {
        shortUrl = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input, textarea"));
          for (const input of inputs) {
            if (input.value && input.value.includes("meli.la/")) {
              return input.value.trim();
            }
          }
          const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a"));
          for (const a of links) {
            if (a.href && a.href.includes("meli.la/")) {
              return a.href.trim();
            }
          }
          return null;
        });
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }

    const now = new Date().toISOString();

    await updateDatabase((db) => {
      const idx = db.offers.findIndex((o) => o.id === offerId);
      if (idx === -1) return;

      if (shortUrl) {
        db.offers[idx].shortUrl = shortUrl;
        db.offers[idx].shortUrlStatus = "pronto";
        db.offers[idx].shortUrlGeneratedAt = now;
        db.offers[idx].shortUrlError = null;
      } else {
        const attempts = db.offers[idx].shortUrlAttempts ?? 1;
        if (attempts >= 2) {
          db.offers[idx].shortUrlStatus = "falhou";
          db.offers[idx].shortUrlError = errorMessage || "Limite de 2 tentativas atingido sem retorno de link meli.la.";
        } else {
          db.offers[idx].shortUrlStatus = "pendente"; // Tentará mais uma vez
        }
      }
    });
  }
}

export const meliQueue = new MeliQueueManager();

export async function generateMeliLaWithPuppeteer(originalUrl: string): Promise<string | null> {
  const db = await readDatabase();
  const offer = db.offers.find((o) => o.originalUrl === originalUrl);
  if (offer) {
    await meliQueue.triggerQueue();
    const updatedDb = await readDatabase();
    const updatedOffer = updatedDb.offers.find((o) => o.id === offer.id);
    return updatedOffer?.shortUrl ?? null;
  }
  return null;
}

export async function enqueueMeliShorten() {
  // Dispara em segundo plano sem bloquear a requisição HTTP
  setImmediate(() => {
    meliQueue.triggerQueue().catch((err) => {
      console.warn("[MeliQueue] Erro ao processar fila:", err);
    });
  });
}
