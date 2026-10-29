import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function isTestIsolationActive(): boolean {
  return Boolean(
    process.env.NODE_TEST_CONTEXT ||
      process.env.NODE_ENV === 'test' ||
      (process.env.RADAR_DB_PATH && process.env.RADAR_DB_PATH.trim().length > 0)
  );
}

export const isSupabaseConfigured = Boolean(
  !isTestIsolationActive() &&
    supabaseUrl &&
    supabaseUrl.startsWith('http') &&
    supabaseServiceKey
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;
