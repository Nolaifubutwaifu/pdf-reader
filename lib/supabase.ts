import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.example to .env.local and fill them in.',
  );
}

/**
 * Browser-side Supabase client. The publishable key is safe to ship — every
 * table and storage object is guarded by row-level security tied to auth.uid().
 */
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Magic-link callbacks arrive as ?code=… ; let the client consume them.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
