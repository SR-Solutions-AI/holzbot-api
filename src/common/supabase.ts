// apps/api/src/common/supabase.ts
import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url) throw new Error('Missing SUPABASE_URL');
    if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    client = createClient(url, key, {
      auth: { persistSession: false },
      db: { schema: 'public' },
    });
  }
  return client;
}
