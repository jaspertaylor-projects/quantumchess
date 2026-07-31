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
- **Play:** vs 18 active AI bots (6 Free, 6 Supporter-or-Premium, 6
  Premium-only), local 2-player
  hotseat, or online 1v1. Optional
  accounts add a rating and saved games.

---

## ⚡ THE RULES — Contact Zap/Heal (adopted 2026-07-11)

The 2026-07-10 "Contact Zap/Heal" experiment won: it is now THE game, and the
old classic ruleset (measurement pulses, coherence points, recoherence
clocks, Zeno, sealed pieces, superposed-king check) is **deleted**, not
dormant. One engine, one ruleset.

- **On every move, the moved piece touches every square it could capture
  on** — reach projects from its LEAST valuable remaining type (p<n<b<r<q<k):
  a fresh blur pokes like a pawn, a confirmed queen sweeps like one.
  - Enemy contacts are **zapped**: each sheds the most valuable possibility
    it can lose CLEANLY (King first), walking down k→q→r→b→n→p. A shed whose
    census cascade would rewrite any other piece is skipped; if nothing sheds
    cleanly the target is **shielded** (gold ring, fizzle).
  - **Zaps strike as one volley** (2026-07-13): every shed is judged against
    the board as the mover landed, then all land together — if the combined
    cascade would ripple beyond the struck pieces, the WHOLE volley fizzles.
    A zap never chooses between victims (no square-order tie-breaks); they
    shed together or shield together. Heals bloom as a volley the same way:
    the census searches joint regain combinations, so two identities can
    support each other even when neither would survive alone. It heals the
    most contacts possible, then chooses the least-value valid combination.
  - Friendly contacts are **healed**: each regains its cheapest missing
    feasible identity, including King as the last rung; when the team is
    kingless, Heal tries King first so it can return (never Pawn on promoted
    pieces/promotion rank; census-claimed types are skipped).
- **Royal safeguard**: if a Zap volley would remove King from every remaining
  holder, all affected King sheds retry from Queen downward. There is no
  victory by wave-function collapse. A temporarily kingless side keeps
  playing and can Heal King back. **Check exists only for a revealed King**
  (`possibleTypes === ['k']`): victory comes by real checkmate.
- **Zap feedback invariant**: every contacted enemy either loses a possibility
  and shows the red zap, or loses nothing and shows the gold shield. This also
  covers fully known pieces and King Guard with no lower identity to shed.
- Resolution order is mover lands → captured victim resolves → conservation
  collapses both sides → contact particles launch → Zap/Heal volley resolves.
- Captures collapse the victim to its least valuable identity. Castling,
  en passant, and promotion carry over
  (castle-through-threat is gone with the check rule).
- UI: red spin-out circle = zap, green bloom = heal, gold ring = shield;
  promoted pieces wear a solid bar. The coherence pips/recoherence dots and
  measurement rings are gone.

Where things stand after the adoption commit:

- **Engine**: single ruleset in `chessboard/quantumEngine.js`
  (`applyContactZapHeal`); no variant plumbing anywhere.
- **Intro game**: fully re-choreographed to teach zap → heal → census →
  cheapest-self reach → least-valuable capture → quantum castle →
  pawn-bishop overflow (`hooks/useIntroSequence.js`, line verified
  move-by-move by `frontend/tmp`-era script, now baked into the constants).
- **Tutorial**: 10 lessons / 21 live-engine exercises rebuilt for the new
  rules; `tests/tutorial-exercises-verify.mjs` re-verifies every exercise's
  success-text claims against the engine.
- **Rulebook**: `tray/RulesModal.jsx` pages rewritten (Zap/Heal/Shields/
  Census/Winning pages; lesson → rules-page links intact).
- **Fixtures**: `tests/fixtures/engine-games.json` regenerated under the new
  rules (140-halfmove cap); `tests/contact-variant-smoke.mjs` is the rules smoke.
- **Daily puzzle: the MINED daily is LIVE (2026-07-14).** The Daily button
  serves `loadDailyMinedPuzzle` (chains mined from real twin-bot games,
  `minedPreviewData.json`: date-pinned `schedule` + rotation fallback +
  `devOnly` staging flag). The old composed generator survives only as the
  dev-only `?puzzleDate` practice preview.
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
- Active access split: 6 Free / 6 Supporter-or-Premium / 6 Premium-only.
  Six more legacy identities remain shelved and retained only so saved
  replays can still resolve its names and avatars.
- Signed-in wins, including a win over the intro bot, offer three randomized
  unlock candidates. At least two match the account's current access tier
  whenever possible; an occasional higher-tier card previews its requirement.
  Choices persist in `qc_bot_unlocks`; clears remain in `qc_bot_progress`.
- Search/eval engine: `frontend/src/ai/alphaBetaEngine.js`
- Avatars: `frontend/public/bots/<id>.png` (drop-in; initials tile otherwise)
- **Bots are fictional scientist × chess-legend parody mashups.** Both
  people supplying a name must be deceased, and avatar art must not depict a
  real person's likeness or imply endorsement. The public character note
  lives on `/about.html` under "The characters".

---

## TODO — what's left

Legend: [ ] not started · [~] in progress · [X] done

### Deployment / infra  — DONE
- [X] Frontend live on quantumchess.ninja (S3 + CloudFront, HTTPS)
- [X] Backend API box live at api.quantumchess.ninja (Caddy auto-HTTPS)
- [X] `qc-deployer` scoped to S3 + CloudFront; deploys invalidate cleanly
- [X] Online 1v1 live: CloudFront `/api/*` -> HTTP origin (trust-store
      workaround) + AllViewerExceptHostHeader; WebSocket play verified
      end-to-end in production
- [X] `www.quantumchess.ninja` resolves and serves (alias + cert)

### Accounts (Supabase)
- [X] Schema applied via GitHub integration (profiles, games, retention,
      username uniqueness, avatar bucket)
- [X] Email/password auth + accounts live (rating, saved games)
- [ ] Decide whether to keep "Confirm email" ON (Dashboard → Authentication).
      With SES SMTP set (below), confirmation emails will actually deliver.
- [X] Stripe Checkout + webhook to flip `tier` to 'paid' automatically —
      **fully tested in sandbox, end-to-end** (2026-07-05): browser checkout
      with the 4242 test card → real webhook flipped tier to paid → Customer
      Portal shows the sub/invoice → real cancellation flipped it back to
      free. Edge Functions deployed (checkout, webhook, portal —
      `tools/deploy-stripe-functions.sh` redeploys), billing migration
      applied (stripe ids + locks `tier` against client self-upgrade;
      webhook is signature-checked and idempotent). Premium UI in
      `AccountModal.jsx`. Sandbox product `prod_UpdjM1t4mob0k4`, price
      `price_1TpyS2Ia1OXAV1NJoP4YJ2n7` ($3/mo), webhook endpoint
      `we_1TpyeVIa1OXAV1NJ80EZVZOp`.
  - [X] Live-mode swap **done 2026-07-06** via `tools/finish-stripe-live.sh`
        (live product/prices/webhook + `supabase secrets set`; live checkout
        session creation verified). Live ids:
        `~/.config/quantumchess-stripe-live.env`; sandbox secrets remain in
        `~/.config/quantumchess-stripe-deploy.env` for test-mode work.
  - [X] **GATE cleared (2026-07-16)**: contact@quantumchess.ninja inbox is
        set up (Proton custom domain) and receiving. It is the published
        support/refund address on /terms.html, /privacy.html, /about.html,
        /faq.html.
  - [X] Terms of service + refund policy (2026-07-06): `/terms.html` —
        recurring-billing disclosure, 14-day no-questions refund (covers
        subscription AND tip), one-time tip terms, Hawaii governing law.
        Linked from all static-page footers + the app footer; renewal/terms/
        refund text sits under the upgrade button in `AccountModal.jsx`.
        Public contact email switched to contact@quantumchess.ninja.
  - [X] **One-time $5 tip → three months ad-free + five engine reviews/day**
        (frontend + webhook deployed 2026-07-20).
        The AccountModal pitch leads with the human ("built and run by one
        person…") and offers "Tip $5" next to the subscription; the webhook
        stamps `ad_free_until = now + 90 days` (stacks on repeat tips), and ads
        gate on tier OR `ad_free_until` (`isAdFree` in `billing.js`). Daily
        engine-review quotas are client-enforced in localStorage: three
        rewarded-ad reviews for Free, five ad-free reviews for tippers, and
        unlimited reviews for Premium (`reviewCapFor`, `reviewsRemaining`,
        `markReviewUsed`). Migration
        `20260709000000_qc_tip_adfree.sql`. Remaining wiring:
    - [X] Dedicated live Tip product and $5 one-time price created 2026-07-20;
          production `STRIPE_TIP_PRICE_ID` switched without touching Premium.
    - [ ] Test with the 4242 card after deployment: tip →
          `?premium=tip_thanks` → profile shows "ad-free until <date>"; ad
          gating off; tip again → date extends by another 90 days.
    - [X] Checkout catalog copy separated from Premium: live product is
          "Quantum Chess Tip" and describes the three-month/five-review benefit.
  - [ ] Cleanup: two e2e test accounts exist (qc-e2e-test-1/2@example.com,
        E2ETester1/2) — delete via Dashboard or SQL when convenient.
- [ ] **Premium tier — promised features** ($3/month). These have been promised
      to users and must ship (or be clearly marked "coming soon") once checkout
      is live:
  - [X] Up to 1,000 saved games (server-enforced by `qc_trim_games`: 10 free /
        1000 paid, and marketed at those exact limits)
  - [X] Game review with engine moves — **built + browser-tested 2026-07-05**
        (ships with next frontend deploy): `review/ReviewModal.jsx` (replay
        board, eval bar, mistake/blunder marks, engine best-move via worker),
        `review/replayCore.js` (timeline rebuild from the lossless move
        records — castle/enPassant flags in `store/gameSlice.js`; the
        13-game fixture suite replays it move-for-move). The pre-flag
        legacy-record translator was removed in the 2026-07-07 cleanup
        (no saved games predate lossless recording).
  - [X] Tiered bot roster — **expanded 2026-07-22**: the eighteen distinctive
        bots are split 6 Free / 6 Supporter-or-Premium / 6 Premium-only.
        Six legacy bots remain shelved from the picker but retained
        for replay compatibility. Avatar PNGs live at `public/bots/<id>.png`.
  - [X] Curated character avatar + tagline — players choose from the model
        roster instead of changing their username or uploading arbitrary
        profile art. The starter roster is free and Premium unlocks the full
        character, tagline, and saying catalog. The legacy avatar bucket and
        upload helper remain in the repository for migration compatibility,
        but are not exposed in the profile UI.
  - [~] No ads for premium (`maybeShowGameEndAd()` gated on `isAdFree()` —
        paid tier OR a tip's `ad_free_until` — in `App.jsx`; ships with next
        frontend deploy)
  - [X] Event sayings — **reworked 2026-07-07 to the character system**:
        speech bubbles on the player bars for win/loss/draw/capture/
        full-army-collapse. NO free text anywhere — every saying and
        tagline belongs to a character in
        `characters/characterCatalog.js` (48 characters mirroring
        `public/avatars/`: 16 starter, 32 premium; each has a tagline + one
        line per event). Players pick per-event from their unlocked
        roster (`sayings/SayingsEditor.jsx` in Settings; tagline picker in
        the account panel). Picks are stored as character ids; any
        unknown value renders as the default character (Pip) instead of
        user prose. All 24 bots have their own tagline + full saying set
        (`ai/bots.js`). Server-side:
        `20260710000000_qc_character_sayings.sql` (applied) retires custom
        text for all tiers and allowlists the starter roster for free
        accounts; `20260711000000_qc_retire_legacy_presets.sql` drops the
        old `p#` preset ids entirely (2026-07-07 cleanup — zero users, so
        the frontend legacy-preset table went too).
      - Character tiers roadmap: 'starter' (everyone), 'quest' (planned:
        earned unlocks recorded in `profile.unlocked_characters` — the
        catalog + `unlockedCharacters()` already support it), 'premium'
        (subscription; tip-unlockables later). Future hardening: a
        `qc_characters` table so the DB can validate taglines/ids by tier
        instead of the in-trigger allowlist.
      Stripe CLI is installed (`~/.local/bin/stripe`) and authenticated against
      the Pura Viba LLC **sandbox** (test mode, key in `~/.config/stripe/config.toml`,
      expires 2026-10-03 — re-run `stripe login` after). Useful for wiring:
      `stripe products/prices create`, `stripe listen --forward-to localhost:<port>/webhook`
      (prints the `whsec_` signing secret), `stripe trigger checkout.session.completed`.
- [X] Ranked online Elo is calculated atomically in Postgres from a
      backend-finalized result. Bot-game ratings remain client-reported and
      must be hardened before they feed a public competitive leaderboard.

### Challenge a friend (private online rooms)
- [X] Built + two-tab tested locally 2026-07-06. Online mode has a
      "⚔ Challenge a Friend" button → private room + invite link
      (`/?join=CODE`, 6-char unambiguous code). Creator waits (White) with a
      copy-link card; the friend opens the link and is seated as Black; the
      game starts on the standard relay (5+5, first-move/abandon timers).
      Backend: `create-private`/`join-private` in `matchmaking/{service,router}.py`
      (invite codes are in-memory — lost on API restart, like all rooms).
      Frontend: `matchmakingClient.js` (createPrivateRoom/joinPrivateRoom/
      readJoinCode), invite card + `?join=` hook in `App.jsx`.
      Also fixed a relay bug this exposed: a reconnect (same clientId, new
      socket) no longer gets kicked when the old socket finishes closing.
- [X] Backend deployed with private-room support (verified 2026-07-16: the
      API box is at `df04c72`, which contains the matchmaking private-room
      code) — challenge links work in production.

### Tests, monitoring, analytics (added 2026-07-06)
- [X] Engine replay regression tests: vitest + 13 fixture games
      (`frontend/tests/`, see "Tests" above); CI on every push
      (`.github/workflows/ci.yml`). Found + pinned a real semantic: a side
      can over-collapse until NO piece can be its king; the engine declares
      that loss only after the opponent's next move.
- [X] Uptime probe every 30 min (`.github/workflows/uptime.yml`) — GitHub
      emails on failure. Live as soon as the workflows are pushed.
- [X] GA4 analytics scaffold, consent-mode aware (`src/analytics/`), and
      SES error-alert emails from the backend (throttled) — code done.
  - [X] ACTIVATE analytics — production Measurement ID configured 2026-07-16:
    1. Go to https://analytics.google.com → sign in with the same Google
       account as AdSense → Admin (gear, bottom-left) → **Create → Property**.
    2. Property name `Quantum Chess`, your timezone, currency USD → Next →
       pick any industry/size → Create, accept terms.
    3. Choose platform **Web** → Website URL `https://quantumchess.ninja`,
       stream name `quantumchess.ninja` → Create stream.
    4. The stream page shows **Measurement ID** `G-XXXXXXXXXX` — copy it.
    5. Add to `frontend/.env.production`:
       `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX`
    6. Deploy:
       `QC_CF_DISTRIBUTION_ID=E3G9M8CYMWWNUF ./deploy/deploy-frontend.sh`
    7. Verify: open quantumchess.ninja, accept the consent banner, then GA4
       → Reports → Realtime should show 1 user within ~60s. Make a move and
       `first_move` appears under Realtime → Event count.
  - [ ] ACTIVATE error alerts — click-by-click (~5 min):
    1. Have the `qc-ses-smtp` SMTP credentials ready (same user/pass pair
       destined for the Supabase SMTP paste; SMTP username looks like
       `AKIA...`).
    2. `ssh -i /home/anonymous/qc_pem/qc-api-key.pem ubuntu@api.quantumchess.ninja`
    3. `cd quantumchess/deploy/api && nano .env` and add (no quotes):
       ```
       QC_ALERT_SMTP_USER=AKIA...
       QC_ALERT_SMTP_PASS=BC...
       QC_ALERT_TO=jaspertaylor15@protonmail.com
       ```
    4. `git pull && docker compose -f docker-compose.prod.yml up -d --build`
       (pull so the box has the alert-handler code; .env is gitignored and
       stays put).
    5. Test from your laptop — this logs a fake frontend error at ERROR
       level, which should email you within ~30s:
       `curl -X POST https://api.quantumchess.ninja/api/client-error -H 'content-type: application/json' -d '{"message":"alert-pipeline test"}'`
    6. No email? Until AWS grants SES production access, only VERIFIED
       addresses can receive — check the recipient is verified in SES
       (us-east-1 → Verified identities) or wait for prod access. Also
       `docker compose -f docker-compose.prod.yml logs backend | grep alerts`
       shows send failures.
    7. Delivery throttle is one email per 15 min (extra errors are counted
       and summarized in the next one) — a quiet inbox is normal.

### Auth email (Amazon SES → noreply@quantumchess.ninja)
- [X] Domain verified in SES (Easy DKIM CNAMEs into Route 53)
- [X] Custom MAIL FROM (mail.quantumchess.ninja) + SPF
- [X] DMARC record (`_dmarc` TXT = `v=DMARC1; p=none;`)
- [X] Dedicated send-only `qc-ses-smtp` IAM user + SMTP credentials created
- [X] Production-access request submitted to AWS (auto-exits sandbox on
      approval, usually <24h — no changes needed when it lands)
- [~] **SMTP creds into Supabase** — believed configured via CLI/Management
      API (unconfirmed 2026-07-16: the CLI keyring token isn't readable from
      the repo, and `qc-deployer` is correctly denied `ses:GetAccount`, so
      neither the paste nor SES production access could be verified from
      here). VERIFY the cheap way: create a fresh account with a real email
      and see whether the confirmation mail arrives. Dashboard location if
      it needs doing: Authentication → Emails → SMTP
      (host email-smtp.us-east-1.amazonaws.com:587, sender
      noreply@quantumchess.ninja).
- [X] Security cleanup: temporary SES/Route53/IAM policies detached from
      `qc-deployer` (verified: SES + Route53 now denied, S3 deploy intact).
- [X] Branded receiving inbox contact@quantumchess.ninja — set up and
      receiving (Proton custom domain; confirmed 2026-07-16). Coexists with
      SES sending.

### Ads (Google AdSense)
- [X] Privacy policy (/privacy.html) + About (/about.html), crawlable static
      HTML, linked in the site footer
- [X] Cookie consent handled by Google's certified CMP (enabled in the
      AdSense dashboard during application)
- [X] Applied to AdSense (pub-5481833391571778): ownership verified via the
      `<head>` snippet, real ads.txt live, review requested
- [X] First review REJECTED 2026-07-12 ("screens without publisher content"
      + "low value content" — the crawler doesn't run the React app, so
      ad-tagged pages looked empty)
- [X] Fix deployed 2026-07-14 (see `AdSenseApprovalPlan.md`): static
      below-the-fold content on the homepage, real rules/strategy/faq pages
      + about rewrite, ad script stripped from privacy/terms, shared footer
      nav, sitemap.xml + robots.txt — all crawlable without JS, UX unchanged.
- [ ] Request re-review (~24-48h after the fix deploy, so from 2026-07-16):
      AdSense → Sites → click the quantumchess.ninja row → Request review
      (or Policy center if greyed out). Then wait days to ~2 weeks; don't
      toggle ad code or click own ads during review.
- [ ] ON APPROVAL — turn ads on: set
      `VITE_ADSENSE_CLIENT=ca-pub-5481833391571778` in
      `frontend/.env.production`, create a responsive display-ad unit and set
      its id as `VITE_ADSENSE_PUZZLE_SLOT`, then redeploy. Verify first with
      `VITE_ADSENSE_TEST=1`: Free reviews unlock only after a completed test
      rewarded ad, normal games are eligible for one end interstitial subject
      to the 180-second floor, and the solved-puzzle card shows a labeled ad
      separated from Share. Then remove the test flag. Keep the existing
      consent choice in place unless the CMP rollout is deliberately changed.
- [ ] ON APPROVAL — in AdSense **Ads → By site → Edit**, leave **Auto ads
      OFF for the entire site**. Do not substitute page exclusions: the game
      is monetized only through the explicit H5 game-end and opt-in
      rewarded-review placements, while the completed-puzzle display slot is
      a separately labeled, manually positioned unit. Guides, Rules, Strategy,
      FAQ, and About intentionally contain no AdSense loader and stay ad-free.
      This keeps automated display units away from the board, move controls,
      Welcome, and the learning library.

### Product / features (nice-to-have)
#### Immediate — DONE (2026-07-05, verified locally in-browser)
- [X] Mobile: side bar replaced with a plain fixed bottom banner — New Game /
      Sign Up / Tutorial / Settings (`components/MobileBar.jsx`, no flash).
      In-game it swaps to compact move navigation (jump-to-start / back /
      forward / jump-to-end + counter) plus resign/draw; the New Game panel
      opens as a bottom sheet.
- [X] Captured pieces are size-aware: they own the right third of the player
      bar, right-aligned, and only shrink when the longest row needs the room.
- [X] New Game button hidden while an online game against another player is
      in progress (resign first).
- [X] Desktop home screen no longer shows the header New Game button while
      the setup panel (with its big Start Game) is visible; Cancel now exists
      ONLY while queued for an online match, next to the "Searching…" banner.
- [X] Online games are rejoinable after a reload/dropped connection: the
      server relays the room's move history and the client replays it
      (deterministic engine). Server-side timers end stuck games: >60s
      disconnected = forfeit, the remaining player wins (voided if nobody had
      moved yet); >30s without a first move = game voided.
- [X] Online draw offers are server-authoritative and non-blocking: a pending
      offer occupies the side-tray header (or mobile status lane), survives
      ordinary moves and reconnects, and exposes Retract to the offerer or
      Accept/Decline to the opponent. Only acceptance broadcasts the agreed
      draw game-over event.
- [X] Public matchmaking has exactly two isolated pools, Ranked and Unranked.
      Both use the server-authoritative 5+5 clock; local and AI games are
      untimed.
- [X] Ranked queue entries require a valid Supabase session. Pairing begins
      within 100 Elo and widens by 100 every ten seconds while waiting.
      Queue polling and WebSocket reconnects use a per-entry opaque ticket.
- [X] Ranked results and K=32 Elo updates are server-side and atomic. Clock,
      resignation, abandonment, and agreed-draw results are inferred by the
      relay; deterministic rules endings require matching claims from both
      seats. One `qc_ranked_matches` row owns the result/moves, with reference
      rows exposing it in both players' normal saved-game histories.
- [X] Sealed pieces — nearly-defined pieces that conservation leaves nothing
      to regain — show a solid line instead of a forever-cycling clock
      (`canPieceRecohere` in the engine). Taught in the tutorial: "Growing
      Back" → "The solid line: sealed".
- [X] Check arrow no longer degenerates on adjacent-square checks: short
      arrows shrink their start inset/head instead of running backwards.
- [X] Promotion glitch root cause: any piece whose asset changed (promotion,
      collapse to a new composite) flashed empty for a frame because the
      styled-SVG lookup was async-only. `StyledSvgImg` now resolves
      synchronously from cache and keeps the previous image on a miss.
- [X] Promotion insignia is now bra-ket braces ⟨…⟩ around the piece's dot
      cluster, in the same color as the recoherence dots.
- [X] Settings → Visual Reminders has cumulative hint presets: Total /
      Amateur (default; hides check arrows) / Master (also hides red check
      rings + weak-measurement circles) / Grand Master (also hides all dots
      and insignia) / GOAT (bands only — no piece icons inside 3+ type
      trapezoids), with Custom via the individual toggles.
- [X] Every tutorial step now has an interactive move-based exercise on the
      real engine (en passant, promotion, Zeno lock, checkmate included —
      some with scripted Black replies).

#### Retention (pre-launch)
- [X] **Daily puzzle — MINED, LIVE since 2026-07-14.** One mined position
      per local day, the same for everyone: a real twin-bot game at the
      moment Black's first mistake from balance mattered. The player answers
      in par mode against the live engine and is graded on the eval gauge
      (star→skull); streaks + a Wordle-style share card.
      `loadDailyMinedPuzzle` serves `minedPreviewData.json`, honoring its
      date-keyed `schedule` map (seed-8 chains pinned 2026-07-15..20 by
      trickiness), falling back through rotation candidates when a chain no
      longer replays; chains flagged `devOnly` are staging-only and never
      served as the daily. Entry: primary Daily Puzzle buttons (side tray +
      mobile bar) with an unsolved dot.
  - Mining runbook: `./tools/mine-twins.sh <seed>` (see the Miner note near
    the top; gate must stay ON). New batches land as `devOnly`, get curated
    via `?mined=N`, then get scheduled. More puzzles needed before
    2026-07-21 (seed-13 in flight under the finalized royal rules).
  - Dev preview (mined): `?mined=N` plays chain N of
    `frontend/src/puzzle/minedPreviewData.json`. Practice mode, dev only.
  - Dev preview (legacy composed): `?puzzleDate=YYYY-MM-DD` opens the OLD
    composed generator in practice mode — the composed system (2026-07-07:
    weekly arc, quantum-native goals, 180-day harness validation) is
    RETIRED from the daily path but its generator + `tools/puzzle-harness.mjs`
    remain for reference; `dailypuzzle.md` documents that era.
  - **PRODUCT RULE — the daily is the only puzzle.** Users must only ever
    see TODAY's puzzle. Never ship an archive, date picker, "tomorrow"
    peek, or any other user-facing path to past or future puzzles — the
    fixture ships future chains, so any date-addressable UI leaks them, and
    the once-a-day scarcity is the retention mechanic. Both preview params
    (`?puzzleDate`, `?mined`) are hard-gated to dev builds in `App.jsx`
    (`import.meta.env.DEV`); the canonical production entry is `/puzzle`
    (legacy `/?puzzle` links still work),
    which opens today's. Keep it that way.
- [X] **First-60-seconds onboarding / "first move theater"** — shipped as
      the first-visit intro (2026-07-14..16): the board is live immediately
      (no Start wall), e2 glows, and the first interaction quietly seats a
      scripted, narrated easy bot that walks a full guided opening (zaps,
      heals, census, castle, en passant, promotion) with speech cards and a
      pulsing Continue. Layout is jump-free on phone and desktop (reserved
      speech lane; `useIntroSequence` + `introSequenceData`).
- [X] **Bias the home screen toward today's loop** — tray menu v2: Play
      Game / Daily Puzzle (primary, with unsolved dot) / Tutorial / Rules as
      big buttons; mobile bar gets the same Daily Puzzle button + dot.
- [ ] **Post-move "Explain why" affordance**: when a surprising collapse,
      coherence shed, king prune, en passant, or checkmate happens, offer a
      tiny contextual explanation. Not a rules essay: one sentence such as
      "King was removed because that square was threatened" or "This piece
      lost Pawn because its coherence hit 0." This turns "bug?" moments into
      teachable moments.
- [ ] Achievements (~15–20, client-side): tutorial finished, first en
      passant, first quantum promotion, castle-resolve, beat each bot tier…
      surfaced at game end next to the winner modal.
- [X] **Branching bot roster** (reworked 2026-07-21):
      `frontend/src/ladder/BotLadderPanel.jsx` is the opponent picker. Isaac
      Steinitz is always available; every signed-in bot win opens a choice of
      three not-yet-unlocked opponents on the result screen. Candidate cards
      include avatars, ratings, and playing styles. Two are playable at the
      current account tier whenever the remaining roster permits, while an
      occasional higher-tier card clearly links to Supporter/Premium. The
      chosen bot becomes the next-game selection and persists in Supabase
      `qc_bot_unlocks`. Clears persist separately in `qc_bot_progress`, and
      old saved wins continue to count. Signed-out winners are prompted to
      sign in or create a free account to begin collecting unlocks.
  - [ ] Remaining: surface the unlocked tagline/sayings/character flavor
        in the profile and bot picker (the clear + `unlocked_flavor_at`
        timestamp are already recorded per account).
- **SHELVED** · **Enter the Unstable Line** — the post-launch roguelite run
  mode is parked: code kept at `frontend/src/unstableLine/` but imported by
  nothing (unbundled, unreachable); its `qc_unstable_runs` migration was
  removed. Don't re-wire until run modifiers are real gameplay rather than
  labels. Full design notes live in git history (this README before
  2026-07-16).
- [ ] **Make premium desire-timed instead of account-panel-only**: upsell at
      the moment the player wants the thing — locked premium bot selected,
      "Analyze this game" after a loss, saved-game cap reached, profile
      character/tagline preview clicked. The account panel remains the
      checkout surface; the pitch starts from intent.
- [ ] **POST-LAUNCH** — Daily-puzzle leaderboard (today's fastest solves —
      resets daily so it never looks dead; needs a small Supabase table + rate
      limiting). Deferred until after launch. **When built, exclude the
      warm-queue bots** (see below) — any public ranking must never list a bot
      as a human. Same rule applies to a public ranked/Elo leaderboard.
- [~] **Shareable replay / collapse cards**: saved-game public replay links
      are built (`qc_share_game`/`qc_get_shared_game` capability-token RPCs;
      anonymous links expose one game only). Remaining: after wild moments (full-army
      collapse, quantum promotion, en passant phantom, checkmate, daily
      solve), offer a share card or replay link that shows the actual board
      story. Text-only is fine for v1; best version is a tiny animated replay
      or generated card built for Reddit/Twitter/Discord.
- [ ] **Shareable replay / Strategy**: donate to popular streamers and ask them to challenge me on my site in the donation.  If they do clip it and post on socials.
- [ ] Warm the queue during low-activity periods: run a few varying-strength
      bots (real accounts, honest K=32 ratings) in the **unranked** pool so a
      lone player never faces an empty queue. Constraints agreed 2026-07-22:
      keep them OUT of the ranked pool (server-authoritative Elo), and flag the
      accounts so any future public leaderboard (puzzle or ranked) excludes
      them — never present a bot as a human. Existing bots already randomize
      moves (`noise` + random openings), so a memorized-line rating farm is not
      a concern.
#### Later
- [X] Replay saved games from stored move lists: all signed-in tiers can step
      through the mainline and play legal what-if variations without engine
      output; Premium review adds evaluations, marks, and suggested lines.
- [ ] Rewarded ad placement (opt-in, ~3-5x interstitial CPM) — e.g. "watch
      to see full post-game analysis"

### Code nice-to-haves
- **HOUSE RULE (2026-07-10 cleanup): no source file over 800 lines.** The
  whole tree currently complies; split along real seams (see the extracted
  modules below for the pattern), never mid-concern.
- [X] **Extract `App.jsx` orchestration into focused hooks/controllers** —
      done 2026-07-10: App.jsx is a ~750-line composition root; online play
      (`hooks/useOnlineGame.js`), intro choreography (`useIntroSequence`),
      board input (`useBoardInput`), player bars/sayings/monetization/
      recording/clock/layout/puzzle-links each own their concern. Shared
      commit path (`commitEngineResult`) replaced ~6 pasted
      dispatch-records/relay loops.
- [ ] **Add UI smoke/e2e coverage for launch-critical flows**: the engine
      replay suite (`frontend/tests/engineReplay.test.js`) is the right
      regression net for rules, but the launch paths also need browser-level
      coverage: first visit/onboarding, bot game start, daily puzzle solve,
      account modal, locked premium bot upsell, saved-game review, and
      challenge-link creation/join. Playwright would fit this repo well.
- [ ] **Move multiplayer state out of process memory before serious ranked
      play**: `backend/app/matchmaking/service.py` intentionally stores queue,
      rooms, invites, and client mappings in module-level dictionaries. Fine
      for a cheap launch relay; before public leaderboards or higher online
      volume, move room/clock/session state to Redis or Supabase-backed
      storage so deploys/restarts do not erase live games and multiple API
      instances can run.
- [ ] **Finish hardening non-ranked user-visible systems**: ranked online Elo
      is server-owned, but bot-game rating reports and some perk quotas remain
      client-reported/client-enforced (`frontend/src/account/gameSync.js`,
      `frontend/src/account/billing.js`). Before a combined public leaderboard
      or abuse-sensitive rewards, isolate bot ratings or validate those writes,
      plus review quotas, achievements, and leaderboard writes, server-side.
- [X] **Split the largest domain files** — done 2026-07-10 along real seams:
      quantumEngine.js is a facade over engineTypes/engineGeometry/
      engineConservation (importers unchanged); puzzleGenerator.js is entry
      points over puzzleBoardKit + two recipe modules (30 consecutive daily
      puzzles verified hash-identical to the pre-split generator — no
      PUZZLE_VERSION bump needed); puzzle-miner.mjs is a CLI driver over
      tools/miner/{config,gameplay,themes,swing}.mjs; ReviewModal splits
      into useGameEvalGraph/useReviewVariation/EvalTraceGraph.
- [X] **Promote analytics from scaffold to product dashboard** — stable,
      privacy-safe events now cover first move, tutorial begin/step/finish,
      daily opened/solved/shared, bot game finished, premium upsell
      viewed/clicked, account created, checkout started, and review opened.
      The GA4 custom dimensions, key events, and four recommended Explore
      funnels are documented in `frontend/src/analytics/README.md`.

### Art
- [X] `anonymous.png` and `stranger.png` for the human players

### Growth
- [ ] Launch post for r/chess and Hacker News ("chess where no piece knows
      what it is yet"). The chess.com winks (console message, avatar hover,
      /humans.txt) fire for anyone who arrives — so traffic is the goal.
- [ ] **Make the killer launch clip**: 15–30 seconds, no narration needed:
      every piece is every piece → knight move becomes Knight → diagonal
      slide becomes Bishop/Queen → capture collapses → checkmate lands.
      This clip likely matters more than another feature for the first wave.
- [ ] **Daily-puzzle share copy polish**: make the copied/shared text punchy
      enough to carry the concept out-of-context, e.g. puzzle number, result,
      streak, compact eval/attempt bar, and one strange line about what
      happened ("My queen was also my king until it wasn't.").
