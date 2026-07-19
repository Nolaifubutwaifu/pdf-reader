import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Whether the app has credentials to talk to Supabase at all. Checked before
 * anything tries to use the client — a deployment missing its environment
 * variables should say so plainly rather than throwing on import and leaving
 * a blank page.
 */
export const supabaseConfigured = Boolean(url && key);

export const missingEnvVars = [
  !url && 'NEXT_PUBLIC_SUPABASE_URL',
  !key && 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
].filter(Boolean) as string[];

/**
 * Browser-side Supabase client. The publishable key is safe to ship — every
 * table and storage object is guarded by row-level security tied to auth.uid().
 *
 * When unconfigured this is constructed against a placeholder so importing the
 * module stays safe; `supabaseConfigured` gates every actual call.
 */
export const supabase = createClient(
  url ?? 'https://unconfigured.supabase.co',
  key ?? 'unconfigured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Magic-link callbacks arrive as ?code=… ; let the client consume them.
      detectSessionInUrl: supabaseConfigured,
      flowType: 'pkce',
    },
  },
);
