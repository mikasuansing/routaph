@AGENTS.md

> Canonical spec: `BASELINE.md`. When code and `BASELINE.md` disagree, fix one on purpose — never drift silently.
> **This is NOT standard Next.js.** Read `node_modules/next/dist/docs/` before using any Next.js API.

---

## Locked Stack (§4) — no changes without an ADR

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router + TypeScript |
| DB | Supabase Postgres + PostGIS |
| Auth | Supabase Auth |
| Cache / rate-limit | Upstash Redis + `@upstash/ratelimit` |
| Maps | Leaflet + react-leaflet |
| Charts | Recharts |
| Tests | Vitest · Playwright · k6 |
| CI | GitHub Actions + gitleaks |

---

## Hard Boundaries (§6)

1. **`lib/supabase/server.ts` only** holds the service-role key. Never import it from a Client Component; never send it to the browser. `lib/supabase/browser.ts` uses the anon key only.
2. **Single API boundary.** Browser → `/api/v1/*` Route Handlers → Supabase. No direct service-role queries from client code.
3. **`lib/routing/` is a pure module.** Zero imports from Next.js, Supabase, or Redis. Input: `TransitGraph + PlanQuery`. Output: `Itinerary[]`.
4. **No Google / third-party Directions API as the core router.**
5. **No hardcoded keys, URLs, or magic numbers.** Everything comes from `process.env`.
6. **RLS on every table.** Run Supabase security advisors after every schema change.

---

## Session Protocol

- **Vertical slices**: data → API → UI → tests. Finish one feature end-to-end before starting the next.
- **Spec before code**: for any new API endpoint, add the contract to `docs/api-contracts.md` first, then write the handler alongside the contract tests.
- **Contract tests (§9.4)**: every endpoint needs validation, response shape, error envelope, status codes, and RLS tests. Minimum 3 failure tests per endpoint.
- **Run `npm run verify` before finishing** — lint + typecheck + test + build + audit + check:migrations. No failures on `main`.
- **Output the §10 handoff** at the end of every session.

---

## API Envelope (§8)

```typescript
{ "data": <payload> }                                    // success
{ "data": [...], "page": { "cursor": "...", "hasMore": true } }  // list
{ "error": { "code": "snake_case", "message": "..." } }  // error
```

Use helpers from `lib/api/envelope.ts`. Status codes: 200/201 OK, 400 validation, 401 unauth, 403 forbidden, 404 not found, 429 rate-limited, 500 internal.

---

## Verify Gate (§11)

```sh
npm run verify   # lint + typecheck + test + build + audit + check:migrations
```

---

## Anti-Goals (§14)

- Service-role key in browser or Client Component
- Google / third-party Directions API as core router
- Hardcoded secrets in source (`gitleaks` CI will block)
- Stretch features (F9–F12) before Core (F1–F5) + 2 differentiators done
- `npm run verify` failures on `main`
- Schema changes without a migration in `supabase/migrations/`
- `any` type without `// TODO: type this properly`
- Ride-hailing fares labeled as official / live prices (estimates only; disclaimer required)
- Raw GPS traces persisted beyond the request

---

## Handoff Format (§10)

End every session with:

```
## Handoff
- **Phase**: <phase + feature>
- **Completed**: <bullet list>
- **`npm run verify`**: PASS | FAIL (<detail>)
- **Contracts added**: <list or "none">
- **Migrations added**: <list or "none">
- **Next**: <what the next session should tackle>
- **Blockers**: <decisions or inputs needed>
```
