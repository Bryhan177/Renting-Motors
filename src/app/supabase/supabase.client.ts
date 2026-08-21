import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!environment.supabaseUrl || !environment.supabaseKey) {
      throw new Error('Faltan supabaseUrl / supabaseKey en environment');
    }
    const isBrowser = typeof window !== 'undefined';
    client = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
        detectSessionInUrl: isBrowser,
      },
    });
  }
  return client;
}
