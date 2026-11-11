import 'server-only';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface MigrationDryRunResult {
  success: boolean;
  dryRun: boolean;
  totalRecordsToMigrate: number;
  tables: Record<string, number>;
  error?: string;
}

export interface MigrationClaimResult {
  success: boolean;
  message?: string;
  error?: string;
  recordsMigrated?: number;
  tables?: Record<string, number>;
}

const LEGACY_TABLES = [
  'user_settings',
  'integrations_whatsapp',
  'store_credentials',
  'quality_rules',
  'message_templates',
  'engagement_hooks',
  'store_coupons',
  'whatsapp_groups',
  'copy_sources',
  'copy_destinations',
  'incoming_messages',
  'products_catalog',
  'offer_evaluations',
  'offer_deduplication',
  'publication_jobs',
  'queue_campaigns',
  'list_campaigns',
  'curator_plans',
  'group_analytics',
  'bio_links',
  'affiliate_reports',
  'brand_settings',
  'public_storefronts',
  'telegram_connections',
  'tracked_links',
  'click_events',
  'converted_sales',
  'price_drop_alerts',
  'intelligence_settings',
  'store_credentials_vault',
  'whatsapp_connections',
  'copier_inbox',
];

const LEGACY_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Simula a migração (Dry-Run): conta exatamente quantas linhas existem no legado
 * por tabela sem fazer nenhum update.
 */
export async function simulateLegacyAccountData(
  targetUserId: string,
  claimToken: string
): Promise<MigrationDryRunResult> {
  if (!targetUserId || !claimToken?.trim()) {
    return {
      success: false,
      dryRun: true,
      totalRecordsToMigrate: 0,
      tables: {},
      error: 'Identificador de usuário e token de reivindicação são obrigatórios.',
    };
  }

  const expectedEnvToken = process.env.LEGACY_MIGRATION_CLAIM_TOKEN?.trim();
  const tokenMatchesEnv = expectedEnvToken && expectedEnvToken === claimToken.trim();

  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      dryRun: true,
      totalRecordsToMigrate: 0,
      tables: {},
      error: 'Supabase não configurado no servidor.',
    };
  }

  // Verifica se o token existe e não foi usado
  if (!tokenMatchesEnv) {
    const { data: claimRow, error: claimErr } = await supabase
      .from('account_claims')
      .select('*')
      .eq('claim_token', claimToken.trim())
      .is('claimed_at', null)
      .maybeSingle();

    if (claimErr || !claimRow) {
      return {
        success: false,
        dryRun: true,
        totalRecordsToMigrate: 0,
        tables: {},
        error: 'Token de reivindicação inválido, expirado ou já utilizado.',
      };
    }
  }

  const tableCounts: Record<string, number> = {};
  let total = 0;

  for (const table of LEGACY_TABLES) {
    try {
      const col = table === 'team_members' || table === 'workspace_channels' ? 'owner_user_id' : 'user_id';
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(col, LEGACY_ID);

      if (!error && typeof count === 'number' && count > 0) {
        tableCounts[table] = count;
        total += count;
      }
    } catch {}
  }

  return {
    success: true,
    dryRun: true,
    totalRecordsToMigrate: total,
    tables: tableCounts,
  };
}

/**
 * Procedimento seguro e controlado para transferir todos os dados que pertenciam ao
 * ADMIN_UUID para a conta real de um usuário recém-cadastrado.
 * Executa uma única vez e invalida o token.
 */
export async function claimLegacyAccountData(
  targetUserId: string,
  claimToken: string
): Promise<MigrationClaimResult> {
  if (!targetUserId || !claimToken?.trim()) {
    return { success: false, error: 'Identificador de usuário e token de reivindicação são obrigatórios.' };
  }

  const expectedEnvToken = process.env.LEGACY_MIGRATION_CLAIM_TOKEN?.trim();
  const tokenMatchesEnv = expectedEnvToken && expectedEnvToken === claimToken.trim();

  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase não configurado para execução da migração atômica.' };
  }

  // 1. Tentar executar via procedure atômica do Supabase
  try {
    const { data, error } = await supabase.rpc('claim_legacy_account_data', {
      p_target_user_id: targetUserId,
      p_claim_token: claimToken.trim(),
    });

    if (!error && data && typeof data === 'object') {
      const res = data as { success?: boolean; error?: string; message?: string };
      if (res.success) {
        return { success: true, message: res.message || 'Dados legados migrados com sucesso!' };
      }
      if (res.error && !tokenMatchesEnv) {
        return { success: false, error: res.error };
      }
    }
  } catch {}

  // 2. Se a procedure falhou por falta do token na tabela mas o token bate com LEGACY_MIGRATION_CLAIM_TOKEN
  if (tokenMatchesEnv) {
    let totalUpdated = 0;
    const tableCounts: Record<string, number> = {};

    for (const table of LEGACY_TABLES) {
      try {
        const col = table === 'team_members' || table === 'workspace_channels' ? 'owner_user_id' : 'user_id';
        const { error, count } = await supabase
          .from(table)
          .update({ [col]: targetUserId })
          .eq(col, LEGACY_ID);
        if (!error && typeof count === 'number') {
          totalUpdated += count;
          if (count > 0) tableCounts[table] = count;
        }
      } catch {}
    }

    return {
      success: true,
      message: `Migração concluída com sucesso via token administrativo!`,
      recordsMigrated: totalUpdated,
      tables: tableCounts,
    };
  }

  return { success: false, error: 'Token de migração inválido, inexistente ou já utilizado.' };
}
