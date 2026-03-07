/**
 * Cria cliente Supabase para uso nas Edge Functions
 * Usa service_role_key para acesso completo (sem RLS)
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!
    );
  }
  return _client;
}
