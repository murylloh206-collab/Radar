/*
 * Rodízio do /grupo: fila dos grupos do Radar cujo nome termina em "#N", enchendo um por vez.
 */
export interface RotationGroupInput { groupJid: string; name: string; participantCount: number }
export interface RotationGroup extends RotationGroupInput { number: number }

export function rotationQueue(groups: RotationGroupInput[]): RotationGroup[] {
  return groups
    .flatMap(group => {
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
