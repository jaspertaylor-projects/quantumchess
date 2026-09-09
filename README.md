# Quantum Chess

Chess where every piece begins as a superposition of all six piece types and
collapses as it moves. Every move zaps the enemies it touches and heals the
friends it protects; victory comes by classical checkmate on a revealed
King, while Zap protects the final King possibility. Quantum castling, quantum
promotion, census conservation — deterministic throughout, no dice anywhere.

- **Live:** https://quantumchess.ninja
- **Status:** built and deployed, but **NOT LAUNCHED** — zero promotion so
  far, not even friends-and-family. The site has no real users or paying
  customers **because nobody has been told it exists yet**, not because it
  failed with anyone. Every existing account is a disposable test account
  that can be nuked; deploys and even destructive migrations don't need a
  customer-safety review until real users arrive. Update this line at launch.
- **Play:** vs 24 active AI bots (1 starter, 15 match unlocks, 8 Premium), local 2-player
  hotseat, or online 1v1. Optional
  accounts add a rating and saved games.

---

## Current rules — census-cascade zaps

Move as any remaining identity, then keep only identities compatible with the move.
Contact uses the mover’s cheapest identity. Enemies lose the strongest jointly
census-safe identity; friends regain feasible missing identities. Zaps may force
census collapses anywhere on the target team. The final King possibility is
protected; revealed Kings obey check and checkmate.

See [quick rules](frontend/rules.html), the guided tutorial, and
[the rule change](docs/census-cascade-zap-experiment.md). Run
`cd frontend && npx vitest run tests/introSequence.test.js` after changing teaching content.

Where things stand after the adoption commit:

- **Engine**: single ruleset in `chessboard/quantumEngine.js`
  (`applyContactZapHeal`); no variant plumbing anywhere.
- **Intro game**: fully re-choreographed to teach zap → heal → census →
  cheapest-self reach → least-valuable capture → quantum castle →
  pawn-bishop overflow (`hooks/useIntroSequence.js`, line verified
  move-by-move by `frontend/tmp`-era script, now baked into the constants).
- **Tutorial**: every Tutorial entry opens the guided intro game. Its complete
  move sequence and narrated outcomes are checked in `tests/introSequence.test.js`.
- **Rulebook**: `tray/RulesModal.jsx` pages rewritten (Zap/Heal/Shields/
  Census/Winning pages; lesson → rules-page links intact).
- **Fixtures**: `tests/fixtures/engine-games.json` regenerated under the new
  rules (140-halfmove cap); `tests/contact-variant-smoke.mjs` is the rules smoke.
- **Puzzle verification**: each new candidate records `verification.status`.
  All par positions must agree above confirmation depth; timeout, rejected,
  and cap-skipped candidates stay blocked from the daily. Every output starts
  `devOnly:true`, including streamed candidates. Curate only indexes listed in
  `gate.verifiedChainIndexes`, then remove `devOnly` when scheduling. The report
  keeps incomplete/rejected candidates for diagnosis, and exits nonzero if any
  candidate fails the complete gate. Existing curated fixtures remain compatible.
- **Daily puzzle: the MINED daily is LIVE (2026-07-14).** The Daily button
  serves `loadDailyMinedPuzzle` (chains mined from real twin-bot games,
  `minedPreviewData.json`: date-pinned `schedule` + rotation fallback +
  `devOnly` staging flag). The old composed generator survives only as the
  dev-only `?puzzleDate` practice preview.
- **Latest puzzle release (2026-09-07):** three seed-16 puzzles scheduled
  for September 9–11. All nine par positions passed depth 8; the intro,
  legal replies and complete gauge tables replay under the current engine.
  Verification verdicts and source provenance ship with each new chain.
- **Miner**: pipeline runs on the new rules (and on the FAST engine, ~15x);
  theme tagging keys on zaps/heals. Canonical batch = `./tools/mine-twins.sh
  <seed>` — 24 twin games (identical bots; strong twin +5 beam widths &
  4000ms vs 1000ms), mirror pass, first-grab filter, and the **depth-8
  verification gate ON** (never pass `--verifyCap 0`: seeds 6/8 did, and
  shipped ungated). Chains carry `evalTables` (instant gauge) and `intro`
  (pre-mistake snapshot). The 2026-07-15 royal-rules finalization
  invalidated one old chain (the replay guard in `minedPreview.js` refuses
  drifted chains); seed-13 is the first post-finalization batch.
- **Old saved games** in `qc_games` replay under the new rules and will NOT
  reproduce (zero real users — nuke the rows whenever convenient).

## Architecture at a glance

| Piece | What it is | Where it runs |
|-------|-----------|---------------|
| Frontend | React + Vite SPA; the whole game engine is client-side | S3 + CloudFront (`quantumchess.ninja`) |
| Backend | FastAPI WebSocket relay for online 1v1 only | One EC2 box behind Caddy (`api.quantumchess.ninja`) |
| Accounts | Auth, profiles, ratings, saved games | Supabase (`qc_`-prefixed tables) |
| Auth email | Signup confirmation emails | Amazon SES (domain verified; Supabase SMTP paste + prod-access pending) |
| Ads | Dormant AdSense interstitial at game end | Google AdSense (rejected 2026-07-12; content fix deployed 2026-07-14; re-review pending) |

Bot and local games touch nothing but the CDN, so a traffic spike is cheap.
Only online 1v1 hits the backend. See `deploy/README.md` for the full
provisioning runbook and capacity math.

---

## Local development

> **⚠️ THIS PROJECT IS BUILT AND RUN IN DOCKER — LOCALLY AND ON AWS.**
> Do **not** run `npm install` / `npm run dev` / `pip install` on the host
> and expect it to work; the containers are the supported environment.
> - **Local dev:** `docker compose up` (below) is the one command that runs
>   everything.
> - **Frontend production build:** `deploy/deploy-frontend.sh` builds inside
>   the dev container — don't build with host Node.
> - **Backend production:** built and run via
>   `deploy/api/docker-compose.prod.yml` on the API box.
> - **Node tools** (`tools/*.mjs` harnesses/miners): the frontend container
>   only mounts `frontend/`, so run these from a one-off container with the
>   repo root mounted:
>   `docker compose run --rm --no-deps -v "$PWD":/repo -w /repo frontend node tools/puzzle-harness.mjs`
>   (they are dependency-free ESM, so host Node ≥18 also works in a pinch —
>   but app builds must stay in Docker).

```bash
docker compose up            # frontend on :5175, backend on :8001
```

The frontend hot-reloads. Engine/UI live in `frontend/src/`; the relay in
`backend/app/`.

## Operator CLIs on the dev box (what an agent here can pull off)

Everything below is installed AND authenticated on this machine (verified
2026-07-18). Practical upshot: an agent working in this repo can ship
schema, backend, and frontend to production end-to-end without waiting on a
human — the full loop was exercised on 2026-07-18.

| Tool | Authed as / scope | What it's for here |
|------|-------------------|--------------------|
| `supabase` | Personal token; project **Quantum Chess** (`idulanhleydkejrumpzf`) is `--linked` | `supabase db push` applies `supabase/migrations/` to prod; `supabase migration list` shows drift; `supabase projects api-keys --project-ref idulanhleydkejrumpzf` returns the **anon and service_role keys** |
| `aws` | IAM user `qc-deployer`, account `192366194234` | S3 sync to `quantumchess-ninja-site`, CloudFront invalidation (distribution `E3G9M8CYMWWNUF`), SES (`aws sesv2 …`) — everything `deploy-frontend.sh` needs |
| `gh` / git | GitHub `jaspertaylor-projects` (https, keyring) | Full push access incl. `main` — pushing `main` is a prod act (Supabase migration integration + the API box pulls it) |
| `ssh` | Key `/home/anonymous/qc_pem/qc-api-key.pem` → `ubuntu@api.quantumchess.ninja` | Full control of the prod API box: `quantumchess/` checkout, `deploy/api/.env` (secrets live ONLY there), compose rebuilds, `docker logs api-backend-1` |
| `stripe` | Pura Viba LLC **sandbox** (test mode; key expires 2026-10-04) | Test-mode products/prices/webhooks only — live mode is NOT configured |
| `docker` | Local daemon | The dev stack (see warning above) — all builds/tests run in the containers |
| MCP browser (Claude sessions) | Playwright against any URL | Drive the dev server or prod site headlessly — screenshots, flows, console-error checks |

No `psql`: ad-hoc prod SQL goes through PostgREST/GoTrue admin APIs with the
service_role key (`…/rest/v1/`, `…/auth/v1/admin/…`), or becomes a proper
migration. Host `node` exists but is only for the dependency-free
`tools/*.mjs` — app builds stay in Docker.

**Handling the service_role key**: fetch it into a shell variable at use
time (`SK=$(supabase projects api-keys … | jq -r '…')`), pipe it over ssh
stdin if it must land on the box — never echo it, never commit it, never
put it in a command line that gets logged.

---

## How to update each part

### Frontend (the game, UI, tutorial, accounts UI)

Edit anything under `frontend/src/`, then deploy:

```bash
QC_CF_DISTRIBUTION_ID=E3G9M8CYMWWNUF ./deploy/deploy-frontend.sh
```

This builds (inside the dev container if you have no local Node), syncs to
S3 with correct cache headers, and invalidates CloudFront. Live in ~1 minute.
Requires the AWS CLI configured with the `qc-deployer` key.

### Backend (online-play relay)

Edit under `backend/app/`, commit, push, then on the API box:

```bash
ssh -i /home/anonymous/qc_pem/qc-api-key.pem ubuntu@api.quantumchess.ninja \
  'cd quantumchess && git pull && cd deploy/api && docker compose -f docker-compose.prod.yml up -d --build'
```

Exactly ONE backend instance — matchmaking/game state is in-memory. Scaling
out would need shared state (Redis) first.

### Database / schema (Supabase)

Never edit tables by hand in production. Instead:

1. Add a new timestamped file to `supabase/migrations/`
   (e.g. `20260801000000_add_thing.sql`), written to be re-runnable.
2. Commit and push to `main`.
3. The Supabase GitHub integration applies it automatically on merge.

The current schema (profiles, games, retention triggers, username
uniqueness, avatar bucket) lives in
`supabase/migrations/20260705000000_qc_accounts_init.sql`.

Manual admin (grant paid tier, inspect data): Supabase Dashboard → SQL
Editor. E.g. to comp someone the paid tier:
```sql
update qc_profiles set tier = 'paid' where id = '<user uuid>';
```

### Accounts / login behavior

- Auth logic: `frontend/src/account/useAuth.js`
- Sign-in/profile UI: `frontend/src/account/AccountModal.jsx`
- Saved-game client + bot Elo: `frontend/src/account/gameSync.js`
- Ranked online auth, matching, results, and Elo:
  `backend/app/matchmaking/` +
  `supabase/migrations/20260721150000_qc_authoritative_ranked_matches.sql`
- Supabase connection: `frontend/src/account/supabaseClient.js`
  (URL + publishable key in `frontend/.env` — public by design)

Auth provider settings (email confirmation on/off, OAuth providers, email
templates, custom SMTP) live in the Supabase Dashboard, not in code.

### Ads

- Logic: `frontend/src/ads/adService.js` (dormant until `VITE_ADSENSE_CLIENT`
  is set; frequency caps at the top of the file).
- Free users can unlock up to three engine reviews per local day; each unlock
  requires the rewarded placement's `adViewed` callback. Tippers receive five
  ad-free reviews/day and Premium is unlimited.
- Requests a game-end interstitial after each eligible finished game while
  retaining a 180-second floor between viewed ads.
- A responsive display unit appears in the solved-puzzle result card when
  `VITE_ADSENSE_PUZZLE_SLOT` is configured. It has a labeled, whitespace-
  separated region away from Share and is absent for ad-free accounts.
- `frontend/public/ads.txt` holds the AdSense verification line.

### Analytics (Google Analytics 4)

- Logic: `frontend/src/analytics/analytics.js` — dormant until
  `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX` is set in `frontend/.env.production`
  (active for the main game application; standalone static pages are
  intentionally untagged). Consent-Mode-aware: analytics cookies default to
  denied; the consent banner's choice flips both ad and analytics consent.
  Product events and GA4 dashboard setup are documented in
  `frontend/src/analytics/README.md`.

### Admin stats dashboard (first-party analytics)

Signed-in accounts flagged `is_admin` get a **Site Stats** button in the
account panel: live players-online/games-in-progress tiles (backend
`/api/matchmaking/metrics`, polled), concurrency + games-per-day charts, and
account counts. Grant admin in the Supabase SQL Editor:
```sql
update qc_profiles set is_admin = true where lower(username) = lower('<name>');
```

Plumbing (schema: `supabase/migrations/20260718000000_qc_admin_stats.sql`):

- **Concurrency history**: `backend/app/stats/sampler.py` samples matchmaking
  every 20s and writes minute-maxes to `qc_stat_snapshots` (skips all-zero
  stretches; hourly heartbeat row). Peak-since-deploy also rides on the
  metrics endpoint.
- **Finished games**: online games are recorded server-side at the relay's
  exactly-once game-over broadcast; bot games arrive via an unauthenticated,
  rate-limited `POST /api/stats/game-finished` ping from the client
  (`frontend/src/analytics/statsPing.js`) — treat bot counts as approximate.
- **Writes need the service-role key**: set `QC_SUPABASE_URL` +
  `QC_SUPABASE_SERVICE_KEY` in `deploy/api/.env` on the API box (same flow as
  the alert vars below). Unset = sampler still runs, nothing persists.
- **Reads are RLS-gated**: only admins can select the stats tables
  (`qc_is_admin()` policies); the dashboard reads Supabase directly from the
  browser.

### Error alerts + uptime monitoring

- **Backend error emails**: ERROR-level logs (backend exceptions AND shipped
  frontend errors) email the operator via SES SMTP, throttled to one email
  per 15 min with a suppressed-count summary
  (`ThrottledEmailAlertHandler` in `backend/app/main.py`). Off until
  `QC_ALERT_SMTP_USER` / `QC_ALERT_SMTP_PASS` (the qc-ses-smtp credentials)
  and `QC_ALERT_TO` are set — put them in `deploy/api/.env` on the API box
  (compose reads it automatically; never commit it), then
  `docker compose -f docker-compose.prod.yml up -d`.
- **Uptime**: `.github/workflows/uptime.yml` probes the site + API every
  30 min; a failed probe fails the workflow and GitHub emails you. (Cron
  budget: ~1440 Actions-minutes/month of the 2000 free for private repos —
  don't tighten it casually.)

### Tests

```bash
docker exec -u 1000:1000 -w /app quantumchess-frontend-1 pnpm test
```

`frontend/tests/engineReplay.test.js` replays 13 recorded pseudo-random games
(`tests/fixtures/engine-games.json`) through the engine + `replayCore` and
asserts every position signature, terminal result, and rule invariants — the
regression net under saved games and premium game review. CI runs it on every
push (`.github/workflows/ci.yml`). If an intentional rules change breaks it,
regenerate fixtures with `node tests/generate-engine-fixtures.mjs` (same
docker exec prefix) and say so in the commit.

**The AI searches on a separate FAST engine** (`src/ai/fast/` — packed Int32
boards, journaled make/unmake, ~13–17× the reference) that must stay
BIT-IDENTICAL to the rules engine: `tests/fastEngineDiff.test.js` pins move
lists, resulting positions, eval scores and full search results (move/score/
node counts) against the reference at every sampled fixture position, and
runs in the same `pnpm test`. Any rules change in `chessboard/` must be
mirrored in `src/ai/fast/` (mirror points are marked with `REF:` comments) —
the diff net failing against regenerated fixtures is the reminder. Wider
checks: the random-game soak (`node tests/fast-soak.mjs 20`) and the perf
benchmark (`node tests/engine-bench.mjs --compare baseline`, snapshots in
`tests/bench/`). The worker falls back to the reference engine by flipping
`USE_FAST_ENGINE` in `src/ai/aiWorker.js`.

### The bots

- Roster, ratings, personalities: `frontend/src/ai/bots.js`
- Active access: Isaac is always available, fifteen bots unlock one at a time
  after human matches, and eight open immediately with Premium. Both account
  tiers earn match unlocks; winning is not required. Local two-player and
  online matches count after play begins; bot games and voided games do not.
- Rewards are automatic and follow a fixed roster order, excluding previously earned
  bots. `qc_award_human_match_bot` serializes account awards and deduplicates
  match IDs in `qc_human_match_bot_rewards`. Earned access remains in
  `qc_bot_unlocks`; existing clears and legacy wins are preserved. Guests
  keep unlocks in this browser. All 24 catalog identities are active.
- Search/eval engine: `frontend/src/ai/alphaBetaEngine.js`
- Avatars: `frontend/public/bots/<id>.png` (drop-in; initials tile otherwise)
- **Bots are fictional scientist × chess-legend parody mashups.** Both
  people supplying a name must be deceased, and avatar art must not depict a
  real person's likeness or imply endorsement. The public character note
  lives on `/about.html` under "The characters".
