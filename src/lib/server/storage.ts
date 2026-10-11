import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { LastSearchInfo, Offer } from "../types";

/**
 * ARMAZENAMENTO LOCAL (arquivo JSON)
 * ----------------------------------
 * Por que JSON e não um banco? Porque não precisa instalar nada,
 * você pode abrir o arquivo e ver seus dados, e é suficiente para um MVP.
 *
 * Cuidados para não corromper o arquivo:
 *  1. Escrita "atômica": grava num arquivo temporário e depois renomeia.
 *  2. Fila de escrita: duas alterações ao mesmo tempo não se atropelam.
 */

export interface DatabaseShape {
  version: 1;
  updatedAt: string;
  lastSearch: LastSearchInfo | null;
  offers: Offer[];
}

const EMPTY_DB: DatabaseShape = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  lastSearch: null,
  offers: [],
};

function dataFilePath(): string {
  // Na Vercel (serverless), o sistema de arquivos da aplicação é read-only.
  // Apenas a pasta /tmp tem permissão de escrita.
  if (process.env.VERCEL) {
    return path.join("/tmp", "ofertas.json");
  }
  // O arquivo é lido em tempo de execução; não precisa ser empacotado no build.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), config.dataFile);
}

// Fila compartilhada mesmo se o Next.js carregar este módulo mais de uma vez.
const globalForQueue = globalThis as unknown as { __offersWriteQueue?: Promise<unknown> };

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalForQueue.__offersWriteQueue ?? Promise.resolve();
  const run = previous.then(task, task);
  globalForQueue.__offersWriteQueue = run.catch(() => undefined);
  return run;
}

export async function readDatabase(): Promise<DatabaseShape> {
  const file = dataFilePath();
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ file, "utf8");
    const parsed = JSON.parse(raw) as Partial<DatabaseShape>;
    return {
      ...EMPTY_DB,
      ...parsed,
      offers: Array.isArray(parsed.offers) ? parsed.offers : [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_DB);
    if (err instanceof SyntaxError) {
      // Arquivo corrompido: guarda uma cópia e começa do zero, sem perder o original.
      const backup = `${file}.corrompido-${Date.now()}.json`;
      await fs.copyFile(file, backup).catch(() => undefined);
      console.error(`[storage] JSON inválido. Cópia salva em ${backup}`);
      return structuredClone(EMPTY_DB);
    }
    throw err;
  }
}

async function writeDatabase(db: DatabaseShape): Promise<void> {
  const file = dataFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const content = JSON.stringify({ ...db, updatedAt: new Date().toISOString() }, null, 2);
  await fs.writeFile(tmp, content, "utf8");
  try {
    await fs.rename(tmp, file);
  } catch {
    // No Windows, antivírus/indexador às vezes bloqueia o rename. Plano B: escrita direta.
    await fs.writeFile(file, content, "utf8");
    await fs.rm(tmp, { force: true });
  }
}

/**
 * Lê o banco, aplica uma alteração e salva — tudo dentro da fila.
 * A função `mutator` pode alterar `db` diretamente e devolver qualquer resultado.
 */
export function updateDatabase<T>(mutator: (db: DatabaseShape) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await readDatabase();
    const result = await mutator(db);
    await writeDatabase(db);
    return result;
  });
}
