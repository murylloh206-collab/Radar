import type { UserSession } from '@/lib/server/auth';
import type { CopyDestination, CopySource } from '@/lib/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { readDatabase } from '@/lib/server/storage';
import { copierConnection } from '@/lib/server/copier-group-catalog';
import { WhatsAppPhotoError } from '@/lib/server/whatsapp-photo-context';

export async function scopedCopierRules(session: UserSession, connectionId?: string) {
  const { connection } = await copierConnection(session, connectionId);
  return copierRulesForConnection(session, connection);
}

export async function copierRulesForConnection(session: UserSession, connection: Awaited<ReturnType<typeof copierConnection>>['connection']) {
  const db = isSupabaseConfigured && supabase ? null : readDatabase();
  const belongs = (source: CopySource) => source.userId === session.userId &&
    (source.connectionId === connection.id || (!source.connectionId && connection.isDefault));
  let sources: CopySource[] = [];
  let destinations: CopyDestination[];
  if (isSupabaseConfigured && supabase) {
    const { data: records, error } = await supabase.from('copy_sources').select('*').eq('user_id', session.userId);
    if (error) throw new WhatsAppPhotoError('RULES_UNAVAILABLE', 503, 'Não foi possível consultar as regras salvas.');
    sources = (records || []).filter(row => row.connection_id === connection.id).map(row => {
      const local = { ...(row.configuration || {}) } as Partial<CopySource>;
      return { ownerJid: (row.configuration || {}).ownerJid,
        templateText: local.templateText, imageMode: local.imageMode, startTime: local.startTime, endTime: local.endTime,
        convertAffiliateLinks: local.convertAffiliateLinks, isTestMode: local.isTestMode, testGroupJid: local.testGroupJid, isDemo: local.isDemo,
        id: row.id, userId: session.userId, connectionId: connection.id,
        groupJid: row.source_jid, name: row.source_name, isActive: row.is_active === true,
        operationMode: row.auto_approve ? 'automatico' : 'revisao_manual',
        allowedStores: local?.allowedStores || [], stripThirdPartyLinks: local?.stripThirdPartyLinks ?? true,
        stripExternalTags: local?.stripExternalTags ?? true, customDelaySeconds: local?.customDelaySeconds ?? 60,
        updatedAt: row.updated_at } as CopySource;
    });
    if (sources.length) {
      const { data: targets, error: targetError } = await supabase.from('copy_destinations').select('*').in('source_id', sources.map(source => source.id));
      if (targetError) throw new WhatsAppPhotoError('RULES_UNAVAILABLE', 503, 'Não foi possível consultar os destinos salvos.');
      destinations = (targets || []).map(row => ({ id: row.id, sourceId: row.source_id,
        groupJid: row.target_jid, name: row.target_jid, canPost: false, isActive: row.is_active !== false }));
    } else destinations = [];
  } else {
    sources = db!.sources.filter(belongs);
    destinations = db!.destinations.filter(destination => sources.some(source => source.id === destination.sourceId));
  }
  return { connection, sources, destinations };
}
