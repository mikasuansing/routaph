/**
 * Browser-safe Supabase client (anon key only).
 * Safe to import from Client Components. RLS enforces authorization.
 */
import { createClient } from '@supabase/supabase-js';

// Fall back to inert placeholders so module evaluation never throws when the
// env is absent (e.g. CI prerendering during `next build`). Real requests
// against the placeholders fail at call time, which pages already handle.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key-placeholder';

// Anon-key client — safe to use in the browser. RLS enforces authorization.
export const supabaseBrowser = createClient(url, key);
