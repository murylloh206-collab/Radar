/*
 * Rodízio do /grupo: fila dos grupos do Radar cujo nome termina em "#N", enchendo um por vez.
 */
export interface RotationGroupInput { groupJid: string; name: string; participantCount: number }
export interface RotationGroup extends RotationGroupInput { number: number }

export const DEFAULT_ROTATION_PREFIX = 'Radar de Ofertas';

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Só grupos do próprio Radar: nome começa com o prefixo e termina em "#N" (grupos de terceiros ficam fora). */
export function rotationQueue(groups: RotationGroupInput[], prefix: string = DEFAULT_ROTATION_PREFIX): RotationGroup[] {
  const wanted = fold(prefix);
  return groups
    .flatMap(group => {
      if (wanted && !fold(group.name || '').startsWith(wanted)) return [];
      const match = /#\s*(\d{1,3})\s*$/.exec(group.name || '');
      return match ? [{ ...group, number: Number(match[1]) }] : [];
    })
    .sort((a, b) => a.number - b.number);
}

export function pickRotationGroup(queue: RotationGroup[], limit: number, warn: number): { group: RotationGroup; needsNew: boolean } | null {
  if (!queue.length) return null;
  const last = queue[queue.length - 1];
  const group = queue.find(candidate => candidate.participantCount < limit) || last;
  return { group, needsNew: last.participantCount >= warn };
}
