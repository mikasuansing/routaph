-- 005: Security hardening (Supabase advisor findings, 2026-07-04)
--
-- STATUS (2026-07-08): ran against the live project, but the REVOKEs are
-- silent no-ops — the PostGIS objects are owned by `supabase_admin`, and
-- Postgres ignores revokes of grants the current role (postgres) didn't make.
-- Not fixable from the SQL editor. Risk ACCEPTED: st_estimatedextent only
-- leaks bounding-box statistics, and the sole geometry in this DB is the
-- public stops catalog. See docs/production.md.
--
-- 1. PostGIS ships st_estimatedextent as SECURITY DEFINER and Supabase
--    exposes it via PostgREST RPC to anon/authenticated. The app never
--    calls it from the client — revoke public execution.
-- 2. spatial_ref_sys is a PostGIS reference table without RLS; the app
--    reads it only via the service role, so drop client grants.
--
-- Remaining accepted advisor findings (documented in docs/production.md):
--   - `postgis` extension lives in the public schema (moving it is invasive
--     and Supabase-managed).
--   - `search_logs` has RLS enabled with no policies — intentional: writes
--     go through the service role only; clients have no access at all.

REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean) FROM anon, authenticated;

REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated;
