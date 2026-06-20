/**
 * Browser-safe Supabase client (anon key only).
 * Safe to import from Client Components. RLS enforces authorization.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Anon-key client — safe to use in the browser. RLS enforces authorization.
export const supabaseBrowser = createClient(url, key);
