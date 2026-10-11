/**
 * Inicia o Next.js lendo a porta do arquivo .env.local (ou .env).
 * Uso: node scripts/run.mjs dev   |   node scripts/run.mjs start
 *
 * Por que existe? O Next.js não lê a variável PORT dos arquivos .env,
 * então este pequeno script faz isso antes de iniciar.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2] === "start" ? "start" : "dev";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const port = process.env.PORT || "3000";
const nextBin = path.join("node_modules", "next", "dist", "bin", "next");

console.log(`\n▶ Painel de Ofertas Afiliadas → http://localhost:${port}\n`);

const child = spawn(process.execPath, [nextBin, mode, "-p", port], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
