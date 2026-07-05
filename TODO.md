# Human TODO — things only you can do

## Accounts (Supabase — code is wired, needs one-time setup)
- [ ] Enable the GitHub integration (repo: jaspertaylor-projects/quantumchess,
      working dir ".", production branch "main", Deploy to production ON,
      Automatic branching OFF — it bills outside the spend cap). The schema
      in supabase/migrations/ then applies on merge to main.
      Fallback if the storage-policy section of the migration errors: paste
      that section into the SQL Editor once by hand.
- [ ] Auth settings check (Dashboard → Authentication → Sign In/Providers):
      email+password should be enabled; decide whether to keep
      "Confirm email" on (default) — with it on, users must click the
      email link before first sign-in.
- [ ] To grant paid tier manually until Stripe exists:
      `update qc_profiles set tier = 'paid' where id = '<user uuid>';`
- [ ] Later: Stripe Checkout + webhook to flip tier automatically, and
      move rating updates server-side before any public leaderboard.

## Auth emails from noreply@quantumchess.ninja (domain: owned, on AWS)
- [ ] Amazon SES (same region as your other AWS stuff): verify the domain
      quantumchess.ninja — SES offers one-click DKIM/SPF record creation
      into Route 53 since the domain lives there.
- [ ] Request SES production access (new accounts start in sandbox mode:
      can only email verified addresses; approval usually <24h).
- [ ] Create SES SMTP credentials, then Supabase Dashboard → Project
      Settings → Authentication → SMTP: enable custom SMTP and set sender
      to noreply@quantumchess.ninja.
- [ ] Do this before launch regardless of branding: Supabase's built-in
      sender is rate-limited to a handful of emails per hour — real signup
      traffic will hit that wall immediately.
- [ ] Add a DMARC record too (TXT _dmarc.quantumchess.ninja,
      "v=DMARC1; p=none;") — exotic TLDs like .ninja get eyed by spam
      filters more than .com, so full SPF+DKIM+DMARC alignment matters.
- [ ] Optional polish while in there: Authentication → Email Templates,
      retitle the confirmation email (e.g. "Confirm your Quantum Chess
      account").

## Release blockers
- [ ] Deploy the site to quantumchess.ninja (HTTPS) — domain already owned
      on AWS/Route 53. This is the critical path for everything ad-related;
      AdSense reviews the live site.
- [ ] Add a privacy policy page (required for AdSense approval).
- [ ] Enable a consent banner for EU/UK visitors — easiest is Google's
      "Privacy & messaging" CMP, configured entirely in the AdSense
      dashboard (no code changes needed).

## Ads (wiring is done and dormant — see frontend/src/ads/adService.js)
- [ ] Sign up for AdSense and submit the deployed domain for approval.
- [ ] After approval: put `VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX` in
      `frontend/.env.production` and rebuild.
- [ ] Replace the placeholder in `frontend/public/ads.txt` with the exact
      line AdSense gives you (AdSense → Sites → ads.txt).
- [ ] Verify with test ads first: build once with `VITE_ADSENSE_TEST=1`,
      finish 3 games, confirm the interstitial appears — then remove the
      test flag.
- [ ] Optional tuning: frequency caps live at the top of
      `frontend/src/ads/adService.js` (currently 1 ad per 3 games,
      min 3 minutes apart).

## Art
- [ ] Profile pictures for the human players, dropped into
      `frontend/public/bots/` (square PNG, 128x128+):
      - `anonymous.png` — you (vs AI, and the White seat in Local 2 Player)
      - `stranger.png` — the second player in Local 2 Player
