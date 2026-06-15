import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function supabaseServer() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('[supabaseServer] SUPABASE_SERVICE_ROLE_KEY no configurada — revisa .env.local');
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
