# ParaPo — Production Runbook

> Last updated 2026-07-26. Status legend: ✅ in place · 🔧 prepared, one action needed · 📋 recommended next.

## Frontend

- ✅ Anonymous app, no accounts — root redirects straight to the planner. Login/signup, saved commutes, trip history, and the admin page were removed (2026-07-26 scope change: directions/fares/ETA + live GPS tracking only).
- ✅ Single design system in `app/globals.css` (cream + cobalt tokens, light/dark).
- ✅ Dead code removed: legacy `/api/trips/plan`, design-a–d explorations, `lib/demoNetwork.ts`, `lib/nav.ts`, cookie-session code, `app/auth`, `app/me`, `app/admin`, `app/api/v1/me/*`, `app/api/v1/admin/*`, `proxy.ts`.
- ✅ GPS is opt-in, foreground-only, never persisted (BASELINE §7.7); manual leg-advance fallback when denied.
- ✅ Last-train awareness (`lib/routing/lastTrain.ts`): warns on route cards and the detail screen when a rail leg would board after that line's last train, or is a "final call" within 20 minutes of closing. Closing times are conservative estimates — see the module's doc comment for sources.
- ✅ Beep card fare toggle (`lib/routing/beepFare.ts`): "I have a Beep card" preference in the planner, persisted in `localStorage`. Adjusts displayed fare for LRT-1 (~20% cash/SJT surcharge) and notes MRT-3 (cash discontinued) / LRT-2 (same discounted fare either way) — no fabricated numbers where no real difference exists.

## APIs & backend logic

- ✅ Single boundary: browser → `/api/v1/*` → Supabase; envelope + status codes per `docs/api-contracts.md`.
- ✅ Pure routing engine (`lib/routing/`, zero framework imports), 75+ unit/contract tests.
- ✅ Input validation (zod, Metro-Manila bbox), per-endpoint failure tests.
- ✅ Fares are per-boarding in the A* cost (cheapest ≤ fastest regression-tested) and per-line (LRT-1 vs discounted LRT-2), 2026 LTFRB/DOTr rates verified against news sources.

## Database & storage

- ✅ Live Supabase Postgres + PostGIS, seeded (5 corridors / 66 stops, dated fare history); seeds + schema all in `supabase/{migrations,seed}/`. EDSA Carousel is the full real 24-station Monumento↔PITX route (`supabase/seed/004_edsa_carousel_full.sql`), not the earlier 8-stop demo subset.
- ✅ No raw GPS traces stored anywhere; search logs are geohashed and anonymous.
- 📋 Enable Point-in-Time Recovery (Supabase dashboard → Database → Backups). Free tier keeps daily backups 7 days; PITR needs Pro.

## Auth & permissions

- ✅ No accounts, no Supabase Auth in the app — every `/api/v1/*` endpoint is anonymous. `lib/supabase/browser.ts`/Auth client and `demo@parapo.app` are unused; delete the demo user in the Supabase dashboard (Authentication → Users) whenever convenient — it's inert either way.
- ✅ RLS still enabled on every app table. `saved_routes` / `trip_history` are unused by the app (no login can produce a matching `auth.uid()`) but left in place, not dropped, in case that data is wanted later; `search_logs` and `crowd_reports` are deny-all/insert-only by design (service-role writes only — see `supabase/migrations/009_anonymous_app_no_auth.sql`, **prepared but not yet applied**, no live SQL connection this session).
- ✅ Service-role key exists only in `lib/supabase/server.ts`, used for the handful of endpoints (crowd-reports, station-accessibility read) that still touch the DB server-side.
- ✅ Advisor items on PostGIS (`st_estimatedextent`, `spatial_ref_sys`) — **accepted risk, documented**: the grants belong to `supabase_admin` and cannot be revoked from the SQL editor (silent no-op). Exposure is bbox statistics only, and the only geometry stored is the public stop catalog.
- 📋 Apply `supabase/migrations/009_anonymous_app_no_auth.sql` (makes `crowd_reports.user_id` nullable + anon insert policy) via the SQL editor — verify crowd-report submissions actually persist first; if they already do, the column was already nullable and this is just RLS defense-in-depth.

## Hosting & deployment

- ✅ Live on Vercel: https://parapo-chi.vercel.app (auto-deploys from main; env vars set; health endpoint green).
- ✅ Builds succeed with zero env vars (CI-proven), so preview deployments work before secrets are set.

## CI/CD & version control

- ✅ GitHub Actions: lint → typecheck → coverage tests → build → prod-dep audit → gitleaks secret scan → boot smoke test. Green as of `50c6810`.
- ✅ PR flow (`feat/*` → PR → main). Merging PR #11 puts everything on main.
- 📋 After merging: enable branch protection on `main` (require the CI check).

## Security

- ✅ Headers on every route: HSTS, nosniff, frame-deny, referrer policy, permissions policy; CSP in report-only (flip to enforcing after a week of clean reports).
- ✅ gitleaks in CI; `.env.local` gitignored; no secrets in source.
- ✅ Fare estimates carry disclaimers; no payment processing.

## Rate limiting

- ✅ Upstash sliding windows on every public endpoint (search 20/min/IP, crowd 5/min, auth 5/min), keyed by user id when authenticated. Degrades open in dev when Redis is unset.

## Caching & CDN

- ✅ Route-plan results cached in Redis (geohash+time-bucket+modes key, TTL).
- ✅ Catalog endpoints send `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` — served from the CDN edge on Vercel.
- ✅ Transit graph cached in-process 5 min per instance.
- ✅ Static assets/fonts/map tiles come from CDNs already.

## Load balancing & scaling

- ✅ Serverless-ready: no server state (trip state lives in the browser; cache in Redis), so Vercel scales horizontally without sticky sessions.
- 📋 Watch two limits as traffic grows: Supabase connection count (supabase-js uses HTTP, so this is generous) and Upstash request quota.

## Error tracking & logs

- ✅ Structured API errors (`{ error: { code, message } }`); health endpoint reports dependency status.
- 📋 Add Sentry (`@sentry/nextjs`) for client + server error tracking before launch — the one significant gap. Vercel keeps function logs; Supabase keeps API/db logs (dashboard → Logs).

## Availability & recovery

- ✅ `/api/health` checks Supabase + Redis reachability (200/503) — point an uptime monitor (UptimeRobot/BetterStack) at it.
- ✅ Graceful degradation: Redis down → no cache/rate-limit but planning works; DB empty → seed-graph fallback.
- 📋 Recovery drill: restore = Supabase backup restore + `git checkout` + redeploy; seeds/migrations reproduce the schema and transit data from the repo alone.
