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
- [ ] Later: Stripe Checkout + webhook to flip `tier` to 'paid' automatically
      (until then, comp manually via the SQL in "How to update" above).
- [ ] Later: move rating updates server-side (Edge Function) before any
      public leaderboard — bot-game ratings are currently client-reported.

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
- [ ] Optional: branded receiving inbox (e.g. contact@quantumchess.ninja) via
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
- [ ] The Mobile page looks horrible with the side bar beneath the board.  
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
