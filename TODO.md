# Human TODO — things only you can do

## Release blockers
- [ ] Buy a domain and deploy the site to it (HTTPS). This is the critical
      path for everything ad-related — AdSense reviews the live site.
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
