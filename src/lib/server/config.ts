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
    redirectUri: process.env.ML_REDIRECT_URI?.trim() || "https://painel-de-ofertas.vercel.app/api/auth/callback",
    affiliateMattTool: process.env.ML_AFFILIATE_MATT_TOOL?.trim() || "77625408",
    affiliateMattWord: process.env.ML_AFFILIATE_MATT_WORD?.trim() || "michelhenrique1",
    sessionCookie: process.env.ML_SESSION_COOKIE?.trim() || "",
  },
  shopee: {
    appId: process.env.SHOPEE_AFFILIATE_APP_ID?.trim() || "",
    secret: process.env.SHOPEE_AFFILIATE_SECRET?.trim() || "",
    graphqlUrl:
      process.env.SHOPEE_AFFILIATE_GRAPHQL_URL?.trim() ||
      "https://open-api.affiliate.shopee.com.br/graphql",
  },
};

export function isMercadoLivreConfigured(): boolean {
  const ml = config.mercadoLivre;
  return Boolean(ml.accessToken || (ml.clientId && ml.clientSecret));
}

export function isShopeeConfigured(): boolean {
  const shp = config.shopee;
  return Boolean(shp.appId && shp.secret);
}
