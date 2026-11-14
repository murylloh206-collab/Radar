// Texto do status real de cada loja (usado no painel; sem dependências de servidor).
export interface StoreStatusViewLike {
  store: string;
  status: 'ok' | 'falhou' | 'sem_teste' | 'nao_configurado';
  reason: string | null;
  lastCheckedAt: string | null;
  hint: string | null;
}

const TZ = 'America/Sao_Paulo';
/** ✅ só vale se o último teste for recente (o teste diário roda às 08:00). */
export const STALE_MS = 26 * 60 * 60 * 1000;
const dayKey = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ });

function when(iso: string | null, now: Date): string {
  if (!iso) return 'Ainda não testado';
  const d = new Date(iso);
  const time = d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  if (dayKey(d) === dayKey(now)) return `Testado hoje às ${time}`;
  return `Testado em ${dayKey(d).slice(0, 5)} às ${time}`;
}

export function storeStatusLabel(v: StoreStatusViewLike, now: Date = new Date()): { emoji: string; title: string; detail: string } {
  if (v.status === 'ok') {
    if (v.lastCheckedAt && now.getTime() - Date.parse(v.lastCheckedAt) > STALE_MS) {
      return { emoji: '⚠️', title: 'Teste atrasado', detail: `Último teste: ${when(v.lastCheckedAt, now).replace(/^Testado /, '')}. Clique em Testar agora` };
    }
    return { emoji: '✅', title: 'Conectado', detail: when(v.lastCheckedAt, now) };
  }
  if (v.status === 'falhou') return { emoji: '❌', title: 'Falhou', detail: v.reason || 'Reconecte pela extensão' };
  if (v.status === 'sem_teste') {
    if (v.store !== 'amazon') return { emoji: '🟡', title: 'Ainda não testado', detail: 'Clique em Testar agora' };
    return { emoji: '🟡', title: 'Tag salva', detail: 'A Amazon não permite teste sem API' };
  }
  return { emoji: '⚪', title: 'Não configurado', detail: 'Conecte pela extensão' };
}
