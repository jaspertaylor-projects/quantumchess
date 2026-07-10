# Quantum Chess

Chess where every piece begins as a superposition of all six piece types and
collapses as it moves. Measurement pulses, decoherence, quantum castling,
quantum promotion, recoherence — deterministic throughout, no dice anywhere.

- **Live:** https://quantumchess.ninja
- **Status:** launched, but there are **no real users or paying customers
  yet** — every existing account is a disposable test account that can be
  nuked. Deploys and even destructive migrations don't need a
  customer-safety review until that changes; update this line when it does.
- **Play:** vs 24 AI bots (12 free, 12 premium-locked), local 2-player
  hotseat, or online 1v1. Optional
  accounts add a rating and saved games.

---

## Architecture at a glance

| Piece | What it is | Where it runs |
|-------|-----------|---------------|
| Frontend | React + Vite SPA; the whole game engine is client-side | S3 + CloudFront (`quantumchess.ninja`) |
| Backend | FastAPI WebSocket relay for online 1v1 only | One EC2 box behind Caddy (`api.quantumchess.ninja`) |
| Accounts | Auth, profiles, ratings, saved games | Supabase (`qc_`-prefixed tables) |
| Auth email | Signup confirmation emails | Amazon SES (domain verified; Supabase SMTP paste + prod-access pending) |
| Ads | Dormant AdSense interstitial at game end | Google AdSense (applied; in review) |

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
- Game saving + Elo: `frontend/src/account/gameSync.js`
- Supabase connection: `frontend/src/account/supabaseClient.js`
  (URL + publishable key in `frontend/.env` — public by design)

Auth provider settings (email confirmation on/off, OAuth providers, email
templates, custom SMTP) live in the Supabase Dashboard, not in code.

### Ads

- Logic: `frontend/src/ads/adService.js` (dormant until `VITE_ADSENSE_CLIENT`
  is set; frequency caps at the top of the file).
- Fires an interstitial when the winner modal opens.
- `frontend/public/ads.txt` holds the AdSense verification line.

### Analytics (Google Analytics 4)

- Logic: `frontend/src/analytics/analytics.js` — dormant until
  `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX` is set in `frontend/.env.production`
  (create the property at analytics.google.com, ~5 min). Consent-Mode-aware:
  analytics cookies default to denied; the consent banner's choice flips both
  ad and analytics consent. Custom events via `trackEvent()` (game_end wired).

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

### The bots

- Roster, ratings, personalities: `frontend/src/ai/bots.js`
- Search/eval engine: `frontend/src/ai/alphaBetaEngine.js`
- Avatars: `frontend/public/bots/<id>.png` (drop-in; initials tile otherwise)
- **Characters are fictional parody composites** (scientist × chess legend);
  the disclaimer lives on `/about.html` ("The characters"). Keep it that way:
  never use a real person's full name, and steer avatar art away from real
  people's likenesses — the sensitive ones are living chess pros (Magnus,
  Hikaru, Fabiano, Anand, Kramnik, Polgar, Krush) and the Einstein estate
  (Hebrew University licenses the name aggressively).

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
  - [ ] **GATE (also before live)**: set up the contact@quantumchess.ninja
        inbox (Proton custom domain — see Auth email section). It is now the
        published support address on /terms.html, /privacy.html, /about.html
        and where refund requests go; mail must actually arrive before real
        cards are charged.
  - [X] Terms of service + refund policy (2026-07-06): `/terms.html` —
        recurring-billing disclosure, 14-day no-questions refund (covers
        subscription AND tip), one-time tip terms, Hawaii governing law.
        Linked from all static-page footers + the app footer; renewal/terms/
        refund text sits under the upgrade button in `AccountModal.jsx`.
        Public contact email switched to contact@quantumchess.ninja.
  - [ ] **One-time $5 tip → a year ad-free + one engine review/day** (code
        done, 2026-07-06; wiring pending). The AccountModal pitch now leads
        with the human ("built and run by one person…") and offers "Tip $5"
        next to the subscription; the webhook stamps
        `ad_free_until = now + 1 year` (stacks on repeat tips), ads gate on
        tier OR `ad_free_until` (`isAdFree` in `billing.js`). Tippers also
        get one engine game review per local day (client-enforced quota in
        localStorage, `tipReviewAvailable`/`markTipReviewUsed` — same trust
        level as the premium review gate itself). Migration
        `20260709000000_qc_tip_adfree.sql`. Remaining wiring:
    - [X] Tip prices created (sandbox + live, part of the 2026-07-06
          live-mode swap; `STRIPE_TIP_PRICE_ID` set in both env files).
    - [ ] Test with the 4242 card: tip → `?premium=tip_thanks` → profile
          shows "ad-free until <date>"; ad gating off; tip again → date
          extends by another year.
  - [ ] Cleanup: two e2e test accounts exist (qc-e2e-test-1/2@example.com,
        E2ETester1/2) — delete via Dashboard or SQL when convenient.
- [ ] **Premium tier — promised features** ($3/month). These have been promised
      to users and must ship (or be clearly marked "coming soon") once checkout
      is live:
  - [X] Unlimited saved games (server-enforced by `qc_trim_games`: 10 free /
        1000 paid — marketed as unlimited, the 1000 is an abuse cap)
  - [X] Game review with engine moves — **built + browser-tested 2026-07-05**
        (ships with next frontend deploy): `review/ReviewModal.jsx` (replay
        board, eval bar, mistake/blunder marks, engine best-move via worker),
        `review/replayCore.js` (timeline rebuild from the lossless move
        records — castle/enPassant flags in `store/gameSlice.js`; the
        13-game fixture suite replays it move-for-move). The pre-flag
        legacy-record translator was removed in the 2026-07-07 cleanup
        (no saved games predate lossless recording).
  - [X] More bots — **built + browser-tested 2026-07-06**: 12 premium bots
        in `ai/bots.js` (rated 1300–2250; Ernest Anand 2250 is the final
        boss). Browsable by everyone in the roster (🔒 label); Start becomes
        "Unlock Premium" → account modal for free users. Gating is
        client-side (fine: content, not data). Avatar PNGs optional at
        `public/bots/<id>.png`.
  - [X] Fully customizable profile pic + tagline — **built + browser-tested
        2026-07-06**: editor in `AccountModal.jsx` (paid only), canvas
        center-crop → 256px webp → `qc-avatars` bucket (`avatarUpload.js`);
        `tagline` column + paid-only enforcement trigger in migration
        `20260707000000_qc_profile_tagline.sql` (applied). Avatar + tagline
        show on the player bar (`App.jsx` selfAvatar).
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
- [ ] Later: move rating updates server-side (Edge Function) before any
      public leaderboard — bot-game ratings are currently client-reported.

### Challenge a friend (private online rooms)
- [X] Built + two-tab tested locally 2026-07-06. Online mode has a
      "⚔ Challenge a Friend" button → private room + invite link
      (`/?join=CODE`, 6-char unambiguous code). Creator waits (White) with a
      copy-link card; the friend opens the link and is seated as Black; the
      game starts on the standard relay (5+0, first-move/abandon timers).
      Backend: `create-private`/`join-private` in `matchmaking/{service,router}.py`
      (invite codes are in-memory — lost on API restart, like all rooms).
      Frontend: `matchmakingClient.js` (createPrivateRoom/joinPrivateRoom/
      readJoinCode), invite card + `?join=` hook in `App.jsx`.
      Also fixed a relay bug this exposed: a reconnect (same clientId, new
      socket) no longer gets kicked when the old socket finishes closing.
- [ ] **Deploy the backend** for this to work in production (ssh + compose
      rebuild per "Backend" runbook above) — frontend-only deploys will show
      the button but fail to create rooms until the API box is updated.

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
  - [ ] ACTIVATE analytics — click-by-click (~5 min):
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
       → Reports → Realtime should show 1 user within ~60s. Finish a bot
       game and `game_end` appears under Realtime → Event count.
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
- [ ] **Paste SMTP creds into Supabase** → Authentication → Emails → SMTP
      (host email-smtp.us-east-1.amazonaws.com:587, sender
      noreply@quantumchess.ninja). Works for verified test addresses now;
      for everyone once AWS grants production access.
- [X] Security cleanup: temporary SES/Route53/IAM policies detached from
      `qc-deployer` (verified: SES + Route53 now denied, S3 deploy intact).
- [ ] Branded receiving inbox contact@quantumchess.ninja — NO LONGER optional:
      it is the published support/refund address (see Stripe gate above) — via
      Proton custom domain — separate DNS, coexists with SES sending.

### Ads (Google AdSense)
- [X] Privacy policy (/privacy.html) + About (/about.html), crawlable static
      HTML, linked in the site footer
- [X] Cookie consent handled by Google's certified CMP (enabled in the
      AdSense dashboard during application)
- [X] Applied to AdSense (pub-5481833391571778): ownership verified via the
      `<head>` snippet, real ads.txt live, review requested
- [ ] Waiting on Google's decision email (days to ~2 weeks)
- [ ] ON APPROVAL — turn ads on: set
      `VITE_ADSENSE_CLIENT=ca-pub-5481833391571778` in
      `frontend/.env.production`, delete `<ConsentBanner/>` from App.jsx (now
      redundant with Google's CMP — avoids double-prompting EEA), redeploy.
      Verify first with `VITE_ADSENSE_TEST=1` (finish 3 games, see the test
      ad), then remove the test flag.

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
- [X] **Daily puzzle** (2026-07-07) — one seeded quantum puzzle per local
      day, deterministic and backend-free (same puzzle for everyone; cached
      per device). Weekly difficulty arc: Mon/Tue 1-movers, Wed/Thu 2-move
      chains, Fri/Sat 3-move chains, Sun a 4-move hunt. Quantum-native goals:
      The Instrument (measure 3 at once), The Census (collapse a piece you
      never touch), The Seal, The Snap (the royal {q,k} pair: capturing one member forces
      both identities through conservation alone), The Phantom (en passant
      discovered check), Collapse Mate, plus chains (Snap Trap, Ledger = census→seal,
      The Hunt / Long Hunt rook ladders, The Investigation). Every player
      move is verified by the engine to be the UNIQUE move achieving that
      step's goal; scripted Black replies between steps. Soundness rule: no
      legal Black reply may capture the piece that just made the solution
      move (no "the king just takes back" refutations) — enforced by the
      verifier at every ply. Puzzles are FULL GAME STATES: both sides are
      padded to all 16 pieces with an explicit captured list (definite,
      non-king types, shown above the board), so the engine's conservation
      behaves exactly as in a live game — a lone king-carrier is forced to
      be the king by the census itself, and ambiguity exists only as CLOSED
      GROUPS (N pieces sharing exactly N open slots), the real game's
      structure. 3 attempts, streak, Wordle-style share card. Code:
      `frontend/src/puzzle/` (generator, progress/streak/share, modal);
      entry buttons with an "unplayed" dot in the side tray + mobile bar.
      Validated by harness over 180 consecutive days: 0 failures, avg
      137ms, max ~3.2s generation (cached per device after first open).
  - [ ] BEFORE LAUNCH: set `PUZZLE_EPOCH` in
        `frontend/src/puzzle/puzzleGenerator.js` to launch day (puzzle #1).
  - Dev preview: `http://localhost:5175/?puzzleDate=YYYY-MM-DD` opens any
    date's puzzle in practice mode (nothing recorded, streak untouched).
    Dev builds only. Weekday map: Mon 1-move Instrument, Tue 1-move
    wildcard, Wed Snap Trap (2), Thu Ledger (2), Fri Hunt (3), Sat
    Investigation (3), Sun Long Hunt (4).
  - Dev preview (mined): `?mined=N` plays chain N of the mined-puzzle
    fixture (`frontend/src/puzzle/minedPreviewData.json`) through the
    one-chance eval-gauge modal. Practice mode, dev builds only.
  - **PRODUCT RULE — the daily is the only puzzle.** Users must only ever
    see TODAY's puzzle. Never ship an archive, date picker, "tomorrow"
    peek, or any other user-facing path to past or future puzzles.
    Puzzles generate deterministically client-side, so any
    date-addressable UI leaks every future puzzle — and the once-a-day
    scarcity is the retention mechanic. Both preview params
    (`?puzzleDate`, `?mined`) are hard-gated to dev builds in `App.jsx`
    (`import.meta.env.DEV`); the only production deep link is `/?puzzle`,
    which opens today's. Keep it that way.
  - **Tuning workflow — how to fix a bad puzzle.** When a day's puzzle feels
    wrong (a refutation, a giveaway, too cluttered), don't patch that one
    day — codify the complaint as a VERIFIER rule so it can never ship
    again (e.g. the soundness rule above started as "their king could just
    take back my bishop"). Then re-certify:
    1. `node tools/puzzle-harness.mjs 180 2026-07-10` — generates 180
       consecutive days and independently re-verifies every ply (uniqueness,
       reply legality, weekly arc, timing). Must end `fails: 0`; drift days
       (a chain falling back to a 1-mover) show as `*`.
    2. If a weekday stops converging, `debugRecipe(dateStr, recipeKey)`
       (exported from `puzzleGenerator.js`) reports exactly where all 150
       candidates died — `p0:unsound`, `p0:multiHit`, or build-stage
       counters (`BUILD_FAIL`) for the recipe's placement filters. Loosen
       construction or tighten placement until `ok > 0` on the worst dates.
    3. Bump `PUZZLE_VERSION` — this invalidates every device's cached
       puzzle so the fixed generator takes effect everywhere, same day.
    Difficulty knobs live in the recipes: piece counts, decoys,
    `minChoices` (minimum legal moves so the find is a real search), and
    `TRIES_PER_RECIPE`.
- [~] **Daily puzzle v2 — mined from real games** (see `dailypuzzle.md` for
      the full plan + status). Bot self-play → only-move mining → theme
      tagging → double-depth verification gate, in `tools/puzzle-miner.mjs`
      (run in Docker — see Local development note). The composed generator
      above stays live until mined puzzles pass the 95% agreement gate at
      scale. End state: one-chance eval-bar daily (engine plays Black live),
      emoji-bar share card, puzzles.json published to the CDN.
- [ ] **First-60-seconds onboarding / "first move theater"**: first visit
      should teach the core magic without a modal wall. One glowing piece,
      one obvious move, instant collapse animation, and a tiny line like
      "Every piece starts as every piece. Move it to find out what it was."
      Goal: get a brand-new player to the first "oh, I get it" moment before
      asking them to read rules or choose settings.
- [ ] **Bias the home screen toward today's loop**: make the default first
      choices feel like "Daily Puzzle", "Start bot game", and "Challenge
      friend". Daily should feel like the scarce Wordle-style habit, not a
      side feature hiding in the tray.
- [ ] **Post-move "Explain why" affordance**: when a surprising collapse,
      coherence shed, king prune, en passant, or checkmate happens, offer a
      tiny contextual explanation. Not a rules essay: one sentence such as
      "King was removed because that square was threatened" or "This piece
      lost Pawn because its coherence hit 0." This turns "bug?" moments into
      teachable moments.
- [ ] Achievements (~15–20, client-side): tutorial finished, first en
      passant, first quantum promotion, castle-resolve, beat each bot tier…
      surfaced at game end next to the winner modal.
- [~] **Bot ladder** (2026-07-08): visible 12-bot progression that turns
      vs-AI into a multi-session arc. Shipped:
      `frontend/src/ladder/BotLadderPanel.jsx` IS the Opponent dropdown in
      the New Game vs-AI section (no separate bot `<select>` — one picker,
      no duplicated roster). The trigger shows the selected bot's character
      card; opening it reveals the 12 free bots easiest-first with avatars,
      names, ratings, cleared checkmarks and a "next up" highlight. Locks
      are enforced: only cleared bots and the next rung are playable;
      locked rungs render faded with a 🔒 and a hover hint "Beat <previous
      bot> to unlock", with Magnus Einstein as the final boss at the
      bottom. Below the ladder, subscribers get the premium roster
      appended; free players get "★ 12 more bots available to monthly
      subscribers" which routes into the premium/account flow. First win
      against each bot records the clear in Supabase `qc_bot_progress`
      (`frontend/src/account/botProgress.js`; old saved `qc_games` wins
      count as progress so existing players aren't reset). Signed-out
      players get only the first rung plus "Sign in free to save bot
      unlocks."
  - [ ] Remaining: surface the unlocked tagline/sayings/character flavor
        in the profile and bot picker (the clear + `unlocked_flavor_at`
        timestamp are already recorded per account).
- **SHELVED — post-launch, not in the product** · **Enter the Unstable
  Line**: the roguelite run mode below is parked. The code is kept at
  `frontend/src/unstableLine/` but is imported by NOTHING, so none of it is
  bundled or reachable on the live site; its `qc_unstable_runs` migration
  was removed (only `qc_bot_progress` shipped). Do not re-wire it until the
  run modifiers (clock pressure, pawn starts, takebacks…) are real gameplay
  rather than labels. Design notes preserved below.
  - [ ] **Unstable Line unlock**: after clearing the first 2 beginner ladder
        bots, show a large Daily Puzzle-style button: "Enter the Unstable
        Line". Signed-out players see "Sign in free to save bot unlocks."
        Premium bots remain premium and are NOT part of this mode.
  - [ ] **Unstable Line map**: a route map, not a blind random queue. The
        player charts a 4-fight course toward Magnus Einstein. Each node
        shows a bot avatar/name/rating; the main boss is fixed as
        `magnus-einstein`. With the current 12-free-bot roster, the first 2
        beginner clears unlock the mode, then every run places the remaining
        9 non-boss free bots somewhere on the map plus Magnus Einstein as the
        collapse point. The shortest route to the boss is 3 bot fights +
        Magnus Einstein for a 4-game run. Longer routes are allowed for
        players who want extra pickups or to target specific bot unlocks. This
        lets players choose the bot problems they want to carry instead of
        praying a blind pool serves them.
  - [ ] **Double-slit theme**: visually frame the map as a double-slit
        experiment. The run begins as one beam, splits into two or more
        possible paths, interferes across branching bot choices, and collapses
        into the chosen route toward Magnus Einstein. Unchosen nodes can stay
        faint/ghosted as "paths not observed yet"; chosen fights become the
        measured timeline. This should feel quantumy without making the map
        harder to understand.
  - [ ] **Persistent run modifiers**: bot nodes add the downside, and
        in-between spaces add the upside. Both should generally stick for the
        whole run, so the player is not just picking the next fight; they are
        deciding which problems to carry and which tools to accumulate before
        Magnus Einstein.
  - [ ] **Pickup spaces**: mix non-fight nodes into the map so the player is
        not only choosing opponents. Good first pickups: +1 takeback for the
        run, one free "observe" hint, restore a collapsed pawn at the start of
        each remaining fight, clear one carried disadvantage, reroll a future
        pickup, or reveal nearby hidden nodes. These should be small enough
        that the run still belongs to the chess, but meaningful enough that
        route choice feels strategic.
  - [ ] **Bot-flavored instability**: tie the carried disadvantages to the
        bots you choose to fight. Each bot can have a signature pressure
        pattern so opponents feel distinct even before their search strength
        matters: fast bots create clock pressure, tricky bots start with more
        ambiguous pieces, defensive bots reduce your early capture clarity,
        and chaos bots add recoherence/collapse volatility. This gives every
        bot a recognizable "feel" inside the mode while preserving normal
        fair games in the ladder.
  - [ ] **Run structure**: the map itself owns the choices. Picking a bot node
        means accepting that bot's carried downside; winning the fight awards
        the pickup on the following in-between space. Keep early modifiers
        readable and agency-preserving (no "make the opponent's move" power).
        Good first set: clock pressure, collapsed pawn starts, lower
        coherence starts with stronger pulses, recoherence-clock
        buffs/debuffs, pre-observed pieces, and small run tools such as
        takebacks or observe hints.
  - [ ] **Rewards**: beating any free bot for the first time, in ladder or
        Unstable Line, unlocks that bot's tagline/sayings/character flavor
        for the account. Beating a bot inside Unstable Line also marks it as
        unlocked/cleared for future targeting. Premium subscription still
        unlocks premium bots separately; Unstable Line never grants premium
        bot access.
- [ ] **Make premium desire-timed instead of account-panel-only**: upsell at
      the moment the player wants the thing — locked premium bot selected,
      "Analyze this game" after a loss, saved-game cap reached, profile
      character/tagline preview clicked. The account panel remains the
      checkout surface; the pitch starts from intent.
- [ ] Daily-puzzle leaderboard (today's fastest solves — resets daily so it
      never looks dead; needs a small Supabase table + rate limiting).
- [ ] **Shareable replay / collapse cards**: after wild moments (full-army
      collapse, quantum promotion, en passant phantom, checkmate, daily
      solve), offer a share card or replay link that shows the actual board
      story. Text-only is fine for v1; best version is a tiny animated replay
      or generated card built for Reddit/Twitter/Discord.

#### Later
- [ ] Replay saved games from stored move lists (moves are already saved;
      the engine is deterministic, so this is a UI feature)
- [ ] Paid-tier custom avatar upload UI (storage bucket + policies already
      exist in the schema)
- [ ] Rewarded ad placement (opt-in, ~3-5x interstitial CPM) — e.g. "watch
      to see full post-game analysis"

### Code nice-to-haves
- [ ] **Extract `App.jsx` orchestration into focused hooks/controllers**:
      `frontend/src/App.jsx` currently owns game state wiring, matchmaking,
      auth/billing return handling, ads/analytics, AI, layout measurement, and
      modal state. It works, but future changes get safer if online-game
      orchestration, billing-return polling, game recording, onboarding, and
      layout measurement move into small hooks with narrow tests.
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
- [ ] **Harden trust boundaries for competitive/user-visible systems**:
      ratings and some perk quotas are still client-reported/client-enforced
      by design (`frontend/src/account/gameSync.js`,
      `frontend/src/account/billing.js`). Before public leaderboards,
      tournaments, or any abuse-sensitive rewards, move rating updates,
      review quotas, achievements, and leaderboard writes behind Edge
      Functions or the backend with server-side validation.
- [ ] **Split the largest domain files only when touching nearby behavior**:
      `frontend/src/chessboard/quantumEngine.js`,
      `frontend/src/puzzle/puzzleGenerator.js`, and
      `frontend/src/ai/alphaBetaEngine.js` are big because the domain is big.
      Avoid aesthetic rewrites; instead extract seams around move generation,
      conservation/fixpoint solving, puzzle verification, and eval terms when
      a real feature or test needs that boundary.
- [ ] **Promote analytics from scaffold to product dashboard**:
      `frontend/src/analytics/analytics.js` has the GA4 shell, but the useful
      future layer is named events for activation and retention: first move,
      tutorial step completed, daily opened/solved/shared, bot game finished,
      premium upsell viewed/clicked, account created, checkout started, and
      review opened. These answer which product ideas actually move the odds.

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
