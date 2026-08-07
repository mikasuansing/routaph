-- 007: crowd_reports RLS — scope reads to the reporter's own rows (2026-07-26)
--
-- The live crowd_reports table (and its RLS policies) predate this
-- migration history — its base CREATE TABLE and original policies were
-- never captured in supabase/migrations/ (pre-existing drift; see
-- docs/production.md). The original "crowd_reports_public_read" policy
-- (FOR SELECT USING (true)) let ANY authenticated or anon caller read
-- every user's reports, including free-text `note` content. Phase 2's
-- "Report an issue" feature (docs/api-contracts.md — GET/POST
-- /api/v1/crowd-reports) only ever needs a user's own reports, so this
-- tightens SELECT to owner-only. The app's API route already uses the
-- service-role key and filters by user_id explicitly, so this is
-- defense-in-depth against direct anon-key access, not a functional
-- dependency of the endpoint.
--
-- STATUS: written but NOT YET APPLIED to the live project — this session
-- only had PostgREST (data-row) access, not a SQL connection, so DDL
-- (DROP POLICY / CREATE POLICY) couldn't be executed. Run this file via
-- the Supabase SQL editor before relying on RLS to restrict reads.
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "crowd_reports_public_read" ON crowd_reports;
DROP POLICY IF EXISTS "crowd_reports_select_own" ON crowd_reports;
CREATE POLICY "crowd_reports_select_own"
  ON crowd_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Original insert policy only checked "some user is logged in", not that
-- the row's user_id actually matches them. Replace with a real check.
DROP POLICY IF EXISTS "crowd_reports_auth_insert" ON crowd_reports;
DROP POLICY IF EXISTS "crowd_reports_insert_own" ON crowd_reports;
CREATE POLICY "crowd_reports_insert_own"
  ON crowd_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);
