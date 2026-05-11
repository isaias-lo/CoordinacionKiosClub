import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser-only singleton. Writes session to cookies so middleware can read it.
export const supabase = createBrowserClient(url, anonKey);
