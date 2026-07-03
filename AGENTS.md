
# ParaPo — Agent & Contributor Rules

> Canonical spec lives in `BASELINE.md`. When code and `BASELINE.md` disagree, fix one on purpose — never drift silently.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## Stack (locked — do not change without an ADR)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| DB | Supabase Postgres + PostGIS |
| Auth | Supabase Auth |
| Cache / rate-limit | Upstash Redis (`@upstash/ratelimit`) |
| Maps | Leaflet + react-leaflet |
| Charts | Recharts |
| Unit tests | Vitest |
| E2E | Playwright |
| Load tests | k6 |
| CI | GitHub Actions + gitleaks |

---

## Hard boundaries (violations block merge)

1. **Service-role key server-only.** `lib/supabase/server.ts` is the only place the service-role key may exist. It must never be imported from a Client Component or sent to the browser. `lib/supabase/browser.ts` uses the anon key only.
2. **Single API boundary.** Browser code calls `/api/v1/*` Route Handlers only. It never queries Supabase directly with the service-role client.
3. **Routing engine is a pure module.** `lib/routing/` has zero imports from Next.js, Supabase, or Redis. It takes a graph + query, returns itineraries. This makes it unit-testable in isolation.
4. **No Google Directions for core routing.** The multimodal router is built from scratch. Wrapping a third-party directions API as the core is an automatic reject — it defeats the entire point.
5. **No hardcoded keys, URLs, or magic numbers in business logic.** Everything comes from `process.env`. Provide `.env.example` with blank values.
6. **RLS on every table.** Run Supabase security advisors after every schema change.

---

## Database schema (existing — do not rename tables)

The Supabase project already has an established schema. Adapt code to it; do not create parallel tables.

| Table | Purpose |
|---|---|
| `corridors` | Transit lines (like `lines` in BASELINE) — has `color` column |
| `stops` | Stops — `geom` is PostGIS point; `lat`/`lng` are generated columns |
| `routes` | Directional variants of a corridor |
| `route_stops` | Stop sequence per route (`route_id`, `stop_id`, `seq`) |
| `fares` | Fare rules per route |
| `trips` | Historical trip telemetry (feeds ETA model) |
| `eta_predictions` | Pre-computed ETA by route/segment/hour (1 680 rows) |
| `crowd_reports` | User-filed crowd reports (F9 stretch) |
| `saved_routes` | User-saved commutes (F5) — RLS-scoped to `user_id` |
| `search_logs` | Anonymised search events — drives F8 analytics |

---

## Build method: vertical slices

Build one feature end-to-end (data → API → UI → tests) before starting the next. Do not build layer-by-layer. Phases from `BASELINE.md` Section 13 are the canonical sequence.

---

## Spec before code

For any new API endpoint:
1. Define method / path / auth / params / body / response shape / error codes in `docs/api-contracts.md` first.
2. Write the contract test (validation, shape, error envelope, auth) before or alongside the handler.
3. Mark the contract dated when verified from code.

---

## Verify gate (must pass before every meaningful commit)

```sh
npm run verify
# expands to: lint + typecheck + test + build + audit + migration-check
```

Individual commands:
```sh
npm run lint
npm run typecheck
npm run test
npm run test:cov
npm run build
npm run check:migrations
npm run e2e
```

---

## API envelope

All responses use these shapes — no exceptions:

**Success:** `{ "data": <payload> }`
**List:** `{ "data": [...], "page": { "cursor": "...", "hasMore": true } }`
**Error:** `{ "error": { "code": "snake_case_code", "message": "Human string", "details": {} } }`

Use helpers from `lib/api/envelope.ts`.

---

## Banned moves

- No service-role key in browser or Client Components.
- No hardcoded Supabase URLs / keys / Redis tokens in source.
- No Google/third-party directions API as the core router.
- No stretch features (F9–F12) before Core (F1–F5) + 2 differentiators are done.
- No `npm run verify` failures committed to `main`.
- No schema changes without a checked-in migration in `supabase/migrations/`.
- No `any` type unless you leave a `// TODO: type this properly` comment.

---

## Commit & PR format

**Commit:** concise imperative subject (≤ 72 chars), blank line, then body if needed.
**PR checklist:**
- [ ] `npm run verify` passes
- [ ] New contracts added to `docs/api-contracts.md` with today's date
- [ ] Migration checked into `supabase/migrations/` if schema changed
- [ ] `.env.example` updated if new env vars added
- [ ] Screenshots or curl output for UI / API changes
