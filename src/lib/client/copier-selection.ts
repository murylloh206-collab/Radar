import type { CopySource } from '../types';

export function initialCopierRule(sources: CopySource[], originJid = '') {
  if (originJid) return sources.find(source => source.groupJid === originJid) || null;
  const active = sources.filter(source => source.isActive);
  return active.length === 1 ? active[0] : null;
}

