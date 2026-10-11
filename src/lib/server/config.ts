import "server-only";

/**
 * Lê as configurações do arquivo .env.local (ou .env).
 * Só roda no servidor — credenciais nunca chegam ao navegador.
 */

function parseTerms(raw: string | undefined): string[] {
  const fallback = ["fone bluetooth", "air fryer", "notebook gamer"];
  if (!raw) return fallback;
  const terms = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return terms.length > 0 ? terms : fallback;
}

function parseIntInRange(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const config = {
  searchTerms: parseTerms(process.env.SEARCH_TERMS),
  resultsPerTerm: parseIntInRange(process.env.RESULTS_PER_TERM, 12, 1, 50),
  dataFile: process.env.DATA_FILE?.trim() || "data/ofertas.json",
  mercadoLivre: {
    siteId: process.env.ML_SITE_ID?.trim() || "MLB",
    clientId: process.env.ML_CLIENT_ID?.trim() || "",
    clientSecret: process.env.ML_CLIENT_SECRET?.trim() || "",
    accessToken: process.env.ML_ACCESS_TOKEN?.trim() || "",
  },
};

export function isMercadoLivreConfigured(): boolean {
  const ml = config.mercadoLivre;
  return Boolean(ml.accessToken || (ml.clientId && ml.clientSecret));
}
