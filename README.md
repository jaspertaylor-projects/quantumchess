# Quantum Chess

Chess where every piece begins as a superposition of all six piece types and
collapses as it moves. Measurement pulses, decoherence, entangled castling,
quantum promotion, recoherence — deterministic throughout, no dice anywhere.

- **Live:** https://quantumchess.ninja
- **Play:** vs 12 AI bots, local 2-player hotseat, or online 1v1. Optional
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

### The bots

- Roster, ratings, personalities: `frontend/src/ai/bots.js`
- Search/eval engine: `frontend/src/ai/alphaBetaEngine.js`
- Avatars: `frontend/public/bots/<id>.png` (drop-in; initials tile otherwise)

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
  - [ ] **GATE before deploying the premium UI to production**: swap Stripe
        to live mode (live product/price/webhook + `supabase secrets set`
        with live keys) — the current sandbox checkout cannot take real
        cards. Sandbox secrets: `~/.config/quantumchess-stripe-deploy.env`.
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
    - [ ] Create the one-time price: `stripe prices create --currency usd
          --unit-amount 500 -d product=prod_UpdjM1t4mob0k4` (no recurring
          flags), add `STRIPE_TIP_PRICE_ID=<price_...>` to
          `~/.config/quantumchess-stripe-deploy.env`, re-run
          `tools/deploy-stripe-functions.sh`, apply the migration.
    - [ ] Test with the 4242 card: tip → `?premium=tip_thanks` → profile
          shows "ad-free until <date>"; ad gating off; tip again → date
          extends by another year.
    - [ ] Include a live one-time price in the live-mode swap above.
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
        `review/replayCore.js` (timeline rebuild + legacy-format translator;
        round-trip tested over 25 engine games incl. castles + en passant in
        both flagged and legacy modes). Move recording is now lossless
        (castle/enPassant flags in `store/gameSlice.js`); games saved before
        that replay best-effort and may truncate at an ambiguous move.
  - [X] More bots — **built + browser-tested 2026-07-06**: 4 premium bots in
        `ai/bots.js` (Ada Kramnik 1450, Richard Anand 1850, Lise Botvinnik
        2000, Max Alekhine 2200 — the new final boss). Browsable by everyone
        in the roster (🔒 label); Start becomes "Unlock Premium" → account
        modal for free users. Gating is client-side (fine: content, not data).
        Avatar PNGs optional at `public/bots/<id>.png`.
  - [X] Fully customizable profile pic + tagline — **built + browser-tested
        2026-07-06**: editor in `AccountModal.jsx` (paid only), canvas
        center-crop → 256px webp → `qc-avatars` bucket (`avatarUpload.js`);
        `tagline` column + paid-only enforcement trigger in migration
        `20260707000000_qc_profile_tagline.sql` (applied). Avatar + tagline
        show on the player bar (`App.jsx` selfAvatar).
  - [~] No ads for premium (`maybeShowGameEndAd()` gated on `profile.tier`
        in `App.jsx` — ships with next frontend deploy)
  - [X] Event sayings — **built + browser-tested 2026-07-06**: speech
        bubbles overlaid on the player bars for win/loss/draw/capture/
        full-army-collapse. All 24 bots have authored lines (`ai/bots.js`
        sayings); players pick theirs in the account panel
        (`sayings/sayingsCatalog.js`). Signed-out players get the free
        presets too (picks persist in localStorage `qcSayings`); signed-in
        free = 3 presets/event; premium = 8 + custom text, enforced
        server-side by the trigger in `20260708000000_qc_sayings.sql`
        (applied; free tier limited to preset ids).
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
      never touch), The Seal, The Snap, The Phantom (en passant discovered
      check), Collapse Mate, plus chains (Snap Trap, Ledger = census→seal,
      The Hunt / Long Hunt rook ladders, The Investigation). Every player
      move is verified by the engine to be the UNIQUE move achieving that
      step's goal; scripted Black replies between steps. Soundness rule: no
      legal Black reply may capture the piece that just made the solution
      move (no "the king just takes back" refutations) — enforced by the
      verifier at every ply. 3 attempts, streak, Wordle-style share card. Code: `frontend/src/puzzle/` (generator,
      progress/streak/share, modal); entry buttons with an "unplayed" dot in
      the side tray + mobile bar. Validated by harness over 180 consecutive
      days: 0 failures, avg 26ms, max 268ms generation.
  - [ ] BEFORE LAUNCH: set `PUZZLE_EPOCH` in
        `frontend/src/puzzle/puzzleGenerator.js` to launch day (puzzle #1).
  - Dev preview: `http://localhost:5175/?puzzleDate=YYYY-MM-DD` opens any
    date's puzzle in practice mode (nothing recorded, streak untouched).
    Dev builds only. Weekday map: Mon 1-move Instrument, Tue 1-move
    wildcard, Wed Snap Trap (2), Thu Ledger (2), Fri Hunt (3), Sat
    Investigation (3), Sun Long Hunt (4).
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
- [ ] Achievements (~15–20, client-side): tutorial finished, first en
      passant, first quantum promotion, castle-resolve, beat each bot tier…
      surfaced at game end next to the winner modal.
- [ ] Bot ladder: visible 12-bot progression (beat one to light up the
      next), persistent progress — turns vs-AI (the majority behavior) into
      a multi-session arc.
- [ ] Daily-puzzle leaderboard (today's fastest solves — resets daily so it
      never looks dead; needs a small Supabase table + rate limiting).

#### Later
- [ ] Replay saved games from stored move lists (moves are already saved;
      the engine is deterministic, so this is a UI feature)
- [ ] Paid-tier custom avatar upload UI (storage bucket + policies already
      exist in the schema)
- [ ] Rewarded ad placement (opt-in, ~3-5x interstitial CPM) — e.g. "watch
      to see full post-game analysis"

### Art
- [X] `anonymous.png` and `stranger.png` for the human players

### Growth
- [ ] Launch post for r/chess and Hacker News ("chess where no piece knows
      what it is yet"). The chess.com winks (console message, avatar hover,
      /humans.txt) fire for anyone who arrives — so traffic is the goal.
