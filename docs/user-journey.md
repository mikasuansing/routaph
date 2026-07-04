# ParaPo — User Journey & Improvement Plan

> Drafted 2026-07-02. Companion to `BASELINE.md` §7 (features) and §7.7 (F15 privacy rules).
> Status legend: ✅ built · 🟡 partial · ❌ missing · 🔴 broken as of this audit.

---

## 1. Personas

| Persona | Context | Core need |
|---|---|---|
| **Mia** (primary) | 24, BPO analyst in Makati, lives in QC. Daily jeepney → MRT-3 → walk. Android + Chrome, prepaid data. | Cheapest/fastest route, fare certainty, fast recovery when MRT-3 dies. |
| **Newcomer** | Provincial transferee or visitor. Doesn't know jeepney routes or where to say "para po". | Step-by-step guidance, named landmarks, confidence to board. |
| **Accessibility-first** | PWD / elderly / parent with stroller. | Stop accessibility scores (F7), fewer transfers, less walking. |

Design rule that falls out of these personas: **planning must work without an account**. Nobody creates an account before they know the app can route them home. Auth is the gate for *saving*, not *planning*.

---

## 2. Target user journey

### Stage 0 — Discover & first open
- User lands on ParaPo (link share / search). Planner is usable immediately as a guest.
- Value shown before any signup: plan a real route in < 10 seconds.
- **Status:** 🔴 middleware walls off `/planner` behind `/auth`, and auth itself is a mock — a first-time user currently cannot reach the product at all (see §4.1–4.2).

### Stage 1 — Plan (F1–F3)
- Origin: **"Use my location"** (one-shot `getCurrentPosition`, never persisted) or text search with autocomplete against `stops`.
- Destination: search; recent searches and saved places (Home / Work) surface first.
- Results: 3 itineraries — fastest / fewest transfers / cheapest — with fare breakdown per leg and rush-hour-aware ETA (wire the existing rush toggle to `eta_predictions`).
- **Status:** 🟡 planner + 3-objective engine + fares built; ❌ no "use my location", no autocomplete, no recents/saved places.

### Stage 2 — Decide
- Compare transit vs ride-hailing estimate (F14, disclaimer visible) and Waze deep-link for the "just book it" days.
- Selected itinerary shows step-by-step legs on the Leaflet map.
- **Status:** ✅ mostly built (itinerary detail, Waze link, transport options endpoint).

### Stage 3 — Ride (F15 Trip Companion)
- "Start trip" → **pre-permission explainer** ("Location is used only during your trip, only in the foreground, and never stored") → browser geolocation prompt.
- Live card: current leg, distance + ETA to next stop, auto-advance within 150 m.
- If GPS is denied or unavailable: degrade to **manual mode** — an "I've reached this stop" button advances legs. Never a dead "Waiting for GPS…" screen.
- Keep the screen awake during an active trip (Screen Wake Lock API) — mobile browsers suspend `watchPosition` when the screen locks.
- **Status:** 🟡 tracking/auto-advance/reroute state machine built (context was corrupted, fixed 2026-07-02); ❌ permission explainer, denied-GPS fallback, accuracy guard, wake lock.

### Stage 4 — Disrupt (F13)
- Disruption banner from 30 s poll, or user taps "I'm stuck / line down".
- Reroute from **current GPS**, original destination unchanged, current line excluded; ride-hailing options shown alongside.
- **Status:** ✅ built end-to-end. 🟡 UI has dark-theme regressions (invisible `text-gray-900` on `bg-slate-900`).

### Stage 5 — Arrive
- Arrival summary: actual time vs estimate, fare paid.
- **This is the account-creation moment**: "Save this commute?" → sign up / sign in → saved commute (F5).
- **Status:** 🟡 arrival screen exists; 🔴 auto-saves trip history without asking, contradicting BASELINE §7.7 ("only if the user explicitly saves"), and fabricates `distanceKm` from `totalFare / 10`.

### Stage 6 — Return (retention loop)
- Saved commutes: one-tap re-plan with live conditions.
- Trip history (opt-in), intelligence dashboard (F8), isochrone explorer (F6), accessibility scores (F7).
- **Status:** 🟡 `/api/v1/me/*` scaffolding exists; UI thin; F6–F8 are Phase 5.

---

## 3. Auth (login) journey — target

1. **Guest-first.** `/planner` and `/trip` are public. Middleware protects only `/api/v1/me/*` pages/views (saved commutes, history, account).
2. **One session mechanism.** Adopt `@supabase/ssr` cookie-based sessions so middleware, Route Handlers, and the browser client all read the same session. Today there are three competing mechanisms that don't interoperate (see §4.2).
3. **Real flows wired to Supabase Auth:**
   - Email + password: `signUp` → email OTP `verifyOtp` (the existing 6-digit UI maps directly onto this) → session.
   - Google: `signInWithOAuth` (button exists, currently inert).
   - Forgot password: `resetPasswordForEmail` + `/auth/reset` route.
4. **Respect `?next=`** — middleware already sets it; the auth page must redirect back after login.
5. **Deferred auth prompts** at the moments of value: saving a commute, viewing history — never before first plan.

---

## 4. Defects found in this audit (2026-07-02)

1. **Auth page is a visual mock** (`app/auth/page.tsx`): sign-in is a `setTimeout` + redirect; sign-up, OTP, Google, and forgot-password call no backend. No session is ever created.
2. **Three incompatible session mechanisms**: middleware checks an `sb-<ref>` cookie (wrong name — Supabase uses `sb-<ref>-auth-token`, and the `'sb-' + x ?? 'parapo'` fallback is dead code due to operator precedence — `tsc` flags it); `lib/auth/guards.ts` expects a `parapo_session` cookie or Bearer token; `app/trip/page.tsx` checks the browser client's localStorage session, which middleware can never see. Net effect: login → `/planner` redirect-loops back to `/auth`.
3. **`lib/trip/context.tsx` failed to compile** — corrupted duplicate of the GPS effect spliced into the disruption poll. **Fixed 2026-07-02.**
4. **`lib/auth/session.ts` imports the `cookie` package, which is not in `package.json`** — typecheck fails.
5. **Trip auto-save violates BASELINE §7.7** — on arrival, origin/destination are POSTed to `/api/v1/me/trips` without explicit user action, and `distanceKm` is fabricated as `totalFare / 10`.
6. **Trip screen dark-theme regressions** — `text-gray-900` on `bg-slate-900` renders labels invisible; reroute card uses light-theme `bg-white`/borders inconsistently.
7. **GPS denial is silent** — the error callback is empty; the user sees "Waiting for GPS…" forever with no fallback.
8. **Auto-advance has no accuracy guard** — a fix with 500 m accuracy can falsely advance a leg; ignore fixes with `accuracy > ~100 m` and require 2 consecutive in-radius fixes.

---

## 5. Prioritized roadmap

**P0 — unblock the core loop (nothing else matters until this works)**
- Add the `cookie` dep or drop `lib/auth/session.ts` in favor of `@supabase/ssr`.
- Wire real Supabase Auth (email+password, email OTP verify, Google OAuth, reset) behind the existing auth UI.
- Unify sessions on `@supabase/ssr`; rewrite middleware to validate the real cookie; honor `?next=`.
- Make `/planner` public (guest mode); protect only `me` surfaces.
- Remove trip auto-save or gate it behind an explicit "Save trip" tap (BASELINE §7.7 compliance); drop the fabricated `distanceKm`.

**P1 — first-plan experience**
- "Use my location" origin button (one-shot, HTTPS, never persisted).
- Stop/place autocomplete from the catalog; recent searches (localStorage, guest-friendly); saved places Home/Work (auth).
- Fix trip-screen dark-theme text; consistent tokens.

**P2 — trip companion hardening**
- Pre-permission GPS explainer sheet + denied-GPS manual advance mode.
- Accuracy guard + debounce on auto-advance; off-route detection nudging reroute.
- Screen Wake Lock during active trips; battery note in UI.
- Post-arrival summary with "Save this commute?" prompt (the F5 conversion moment).

**P3 — differentiators (after Core F1–F5 solid, per BASELINE anti-goals)**
- Rush-hour ETAs from `eta_predictions` wired to the existing toggle; live ETA-error % badge.
- Isochrone explorer (F6), accessibility scores (F7), dashboard (F8), crowd reports (F9 stretch).
- PWA install prompt (geolocation + wake lock require HTTPS anyway).

---

## 6. Privacy invariants (restated — these shape the journey)

- GPS is opt-in, foreground-only, held in React state only, never persisted or logged.
- "End trip / Stop tracking" always reachable (exists ✅).
- Anything persisted for a user (saved commutes, explicit saved trips) is origin/destination only — never a trace.
- Analytics events: anonymised + geohashed, no user identifier.
