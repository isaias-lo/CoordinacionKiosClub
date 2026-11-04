import { createBrowserClient } from '@supabase/ssr';
import { fetchConKeepalive } from './subidaAlCerrar';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser-only singleton. Writes session to cookies so middleware can read it.
// `fetchConKeepalive`: la subida al cerrar la app tiene que llegar. Ver `subidaAlCerrar.ts`.
export const supabase = createBrowserClient(url, anonKey, { global: { fetch: fetchConKeepalive } });
