import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface PairingEntry {
  code: string;
  userId: string;
  userEmail: string;
  expiresAt: number;
}

function getPairingFilePath(): string {
  return path.join(process.cwd(), '.data', 'pairing_codes.json');
}

function readPairingEntries(): Record<string, PairingEntry> {
  try {
    const filePath = getPairingFilePath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePairingEntries(entries: Record<string, PairingEntry>): void {
  try {
    const filePath = getPairingFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
  } catch {
    // Fallback silencioso
  }
}

/**
 * Gera um código curto de pareamento para o usuário autenticado (válido por 15 minutos)
 */
export function generatePairingCode(userId: string, userEmail: string): { code: string; expiresInSeconds: number } {
  const now = Date.now();
  const entries = readPairingEntries();

  // Limpar códigos expirados
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry || entry.expiresAt < now) {
      delete entries[key];
    }
  }

  // Gera código legível: ex: RDR-8392A1
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const randChars = crypto.randomBytes(2).toString('hex').toUpperCase();
  const code = `RDR-${randNum}${randChars.substring(0, 2)}`;
  const ttlSeconds = 900; // 15 minutos

  entries[code] = {
    code,
    userId,
    userEmail,
    expiresAt: now + ttlSeconds * 1000,
  };

  writePairingEntries(entries);

  return { code, expiresInSeconds: ttlSeconds };
}

/**
 * Valida e consome um código de pareamento, retornando o userId e userEmail
 */
export function consumePairingCode(code: string): { valid: boolean; userId?: string; userEmail?: string; error?: string } {
  const cleanCode = (code || '').trim().toUpperCase();
  const entries = readPairingEntries();
  const entry = entries[cleanCode];

  if (!entry) {
    return {
      valid: false,
      error: `Código "${cleanCode}" inválido ou já utilizado. Use o código iniciado por RDR- gerado na tela Conectar Lojas (ou clique em "Ou parear com sessão ativa do navegador").`,
    };
  }

  if (Date.now() > entry.expiresAt) {
    delete entries[cleanCode];
    writePairingEntries(entries);
    return { valid: false, error: 'Código de pareamento expirou. Gere um novo código na tela Conectar Lojas.' };
  }

  // Código consumido com sucesso (não pode ser reutilizado)
  delete entries[cleanCode];
  writePairingEntries(entries);
  return { valid: true, userId: entry.userId, userEmail: entry.userEmail };
}
