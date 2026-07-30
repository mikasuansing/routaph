-- 009: Drop the account/login model — the app is now fully anonymous
-- (2026-07-26). Directions/ETA/train-time + live GPS trip tracking is the
-- entire product; saved commutes, trip history, and the account system that
-- backed them (Supabase Auth sign-in, /api/v1/me/*, /admin) are removed from
-- the app. This migration cleans up the tables/policies that existed only to
-- serve those deleted features.
--
-- STATUS: prepared but NOT YET APPLIED — this session had no live SQL
-- connection (Supabase MCP access was unavailable). Run this via the
-- Supabase SQL editor. Confirmed via a real browser POST against production
-- that crowd_reports.user_id is ALREADY nullable (anonymous insert succeeded
-- end-to-end), so the ALTER COLUMN below is a no-op safety net — the RLS
-- policy changes are the only functional part still needed, and only for
-- defense-in-depth against direct anon-key access (the app itself writes
-- through the service-role key, which bypasses RLS entirely).
--
-- Idempotent: safe to re-run.

-- crowd_reports: submissions are anonymous now (no session to attach a
-- user_id to). Make the column nullable and allow anon inserts.
ALTER TABLE crowd_reports ALTER COLUMN user_id DROP NOT NULL;

DROP POLICY IF EXISTS "crowd_reports_insert_own" ON crowd_reports;
CREATE POLICY "crowd_reports_insert_anon"
  ON crowd_reports FOR INSERT
  WITH CHECK (true);

-- No one can read crowd_reports back through the client anymore (the GET
-- endpoint was deleted — there was never a "your reports" list, and without
-- accounts there's nothing to scope a read to). Drop the owner-read policy;
-- the app only ever writes via the service-role key, which bypasses RLS.
DROP POLICY IF EXISTS "crowd_reports_select_own" ON crowd_reports;

-- saved_routes / trip_history: no longer written or read by the app. Left
-- in place (not dropped) in case you want the data later — RLS already
-- restricts them to nothing reachable via the anon/authenticated roles now
-- that there's no login to produce a matching auth.uid().
