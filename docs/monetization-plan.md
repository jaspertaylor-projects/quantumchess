# Monetization plan — tiers, reviews, and ad placements

Status: **implemented and deployed on 2026-07-20.** Everything below records
decisions made with the owner (Jasper). Ad code remains dormant until AdSense
approval lands and its client/slot environment variables are configured.

Last verified 2026-07-20: production Stripe confirmed LIVE (real `cs_live_` session,
$5.00) via a browser checkout; Stripe CLI default repointed to the sandbox profile.
The repository implementation now includes the tier quotas, rewarded review flow,
game-end interstitial cadence, puzzle-completion display slot, tip duration, copy,
documentation, and automated coverage. The frontend, webhook, and dedicated live
Tip catalog entry are deployed; the AdSense launch actions below still remain.

### Remaining launch actions

- After AdSense approval, create a responsive display unit and configure
  `VITE_ADSENSE_CLIENT` and `VITE_ADSENSE_PUZZLE_SLOT` in production.
- Run the live-device checklist in the README before enabling ads for players.

The stack you're building on: **AdSense H5 Games Ads (the Ad Placement API,
`adBreak()` / `adConfig()`)** — see [frontend/src/ads/adService.js](../frontend/src/ads/adService.js).
That API supports both interstitial *and* rewarded placements, and incentivized
(opt-in) formats are allowed under the H5 Games Ads program — unlike incentivizing
a normal display unit, which is a policy violation. The one display-ad placement
below (puzzle modal) is a *separate* AdSense product from the `adBreak()` API and
is new integration.

---

## 1. The tier ladder

The invariant that governs everything: **each tier is at least as good as the one
below it on every axis.** A free user must never be able to out-earn a payer by
watching ads. Money buys *both* fewer ads *and* a higher ceiling.

| | **Free** | **Tip — $5 / 3 months** | **Premium — $3/month** |
|---|---|---|---|
| Price | $0 | $5 one-time, stacks (~$20/yr if repeated) | $3/mo subscription (~$36/yr) |
| Game reviews / day | **3, each gated by a rewarded ad** | **5, no ad** | Unlimited, no ad |
| Interstitial ads (game end) | Yes | Off for the window | Never |
| Interstitial / display ads (puzzles) | Yes | Off for the window | Never |
| Saved games | last 10 | last 10 | up to 1,000 |
| Premium bots | — | — | Yes |
| Custom pic / tagline / full roster | — | — | Yes |

**Tip reviews/day = 5** (confirmed). Visible daylight above free (3), monotonic
below Premium (unlimited).

**Why the ad is friction, not currency:** free reviews are capped at 3/day *and*
each requires watching a rewarded ad. The rewarded reward is only granted in the
SDK's `adViewed` callback, so it's harder to fake than the tip's current
localStorage day-stamp. This is deliberate — see §5.

---

## 2. Pricing changes (from what's live today)

Today: the app **labels** the tip "$3" but the live Stripe price actually **charges
$5.00**, and the webhook grants a **1-year** ad-free window. Target: tip is **$5 for
3 months** (one-time, stacking — still not a subscription). Premium is unchanged at
$3/mo. So the amount is already right on Stripe's side ($5) — only the label and the
duration need to move.

### ⚠️ LIVE-MONEY BUG (fix first, independent of everything else)
**Production Stripe is in LIVE mode** (verified 2026-07-20: clicking Tip created a
real `cs_live_…` session on `acct_1T9quXRFHK9IPoTN`). The live tip price
`STRIPE_LIVE_TIP_PRICE_ID = price_1TqQmFRFHK9IPoTNrAjwcm9I` charges **$5.00**, but
[billing.js](../frontend/src/account/billing.js) advertises "Tip **$3**." A real
user who clicks "Tip $3 once" is sent to a $5.00 live charge. Fix the label to
match reality (which is also the number you want anyway):

- [frontend/src/account/billing.js](../frontend/src/account/billing.js)
  - `TIP_PRICE_LABEL = '$3'` → `'$5'`
  - `TIP_PRICE_VALUE = 3` → `5`
  - `TIP_PITCH` copy — rewrite duration + count, e.g.
    `'Not a subscription person? Tip $5 for three months with no ads, plus 5 engine game reviews a day.'`

The original live tip price shared the Premium product, so renaming that product
would also have renamed Premium. The deployed fix uses a dedicated **Quantum Chess
Tip** product and a new $5 one-time price; the previous price remains only as a
legacy Stripe record and is no longer referenced by production checkout.

**Config reference — don't mix these up:**
- **LIVE (production):** account `acct_1T9quXRFHK9IPoTN`; Premium product
  `prod_Uq70WeLTEfI0Y1`, premium price `price_1TqQmFRFHK9IPoTN9CMiIYxg`, dedicated
  Tip product `prod_UvGLyQrWeq1qNB`, active tip price
  `price_1TvPolRFHK9IPoTNatUnGyd7`, webhook
  `we_1TqQmGRFHK9IPoTNTr8d9l7a`. Deployed via Supabase secrets. The `live` Stripe
  CLI profile has a restricted key for Product and Price catalog maintenance.
- **SANDBOX (local testing):** account `acct_1T9qugIa1OXAV1NJ`, CLI profile
  `"puraviba llc sandbox"` (now the CLI default); test ids in
  `~/.config/quantumchess-stripe-deploy.env`.

### Duration — `1 year → 3 months`
- [supabase/functions/stripe-webhook/index.ts](../supabase/functions/stripe-webhook/index.ts) line ~76:
  `base + 365 * 24 * 60 * 60 * 1000` → `base + 90 * 24 * 60 * 60 * 1000`
  (and fix the "+= 1 year" comments at lines ~3 and ~63–64).
- Update the stale "a year"/"$5 … for a year" comments in
  [supabase/migrations/20260709000000_qc_tip_adfree.sql](../supabase/migrations/20260709000000_qc_tip_adfree.sql).
  (Stacking logic — `greatest(now, ad_free_until) + window` — stays as-is.)

---

## 3. The rewarded-review mechanic (new)

Free users can review a finished game by watching an opt-in rewarded ad, up to
**3/day**. Tippers get **5/day** with no ad. Premium is unlimited. The daily
counter is per-account, per-local-day, in localStorage (same approach as the
existing tip-review gate — see [billing.js](../frontend/src/account/billing.js)
`tipReviewAvailable` / `markTipReviewUsed`, which this generalizes from binary to
a counted cap).

**adService.js — add:**
```
// Resolves true if the user watched to the reward, false if dismissed/unavailable.
// No-ops to false in dev and when ads are unconfigured.
export function showRewardedAd() {
  return new Promise((resolve) => {
    if (!adBreakFn) return resolve(false);
    let granted = false;
    adBreakFn({
      type: 'reward',
      name: 'game-review-unlock',
      beforeReward: (showAdFn) => showAdFn(),   // we already gated on a click
      adViewed:    () => { granted = true; },     // grant ONLY here
      adDismissed: () => {},
      adBreakDone: () => resolve(granted),
    });
  });
}
```

**Quota helper (billing.js) — generalize the day-stamp to a count:**
```
reviewCapFor(profile)        // Infinity if paid, 5 if tipper, else 3
reviewsUsedToday(userId)     // int from localStorage key qcReviewCount:<id>:<day>
reviewsRemaining(profile,id) // cap - used
markReviewUsed(userId)       // increment today's count
```

**Review-button flow (AccountModal saved-game row / useMonetization):**
- Premium → open review directly.
- Tipper, `remaining > 0` → open review, `markReviewUsed`. (No ad.)
- Free, `remaining > 0` → `await showRewardedAd()`; if `true`, open review +
  `markReviewUsed`; if `false`, do nothing (no charge).
- Anyone at `remaining === 0` → notice: "You've used today's N reviews — more
  tomorrow, or go Premium for unlimited."
- **Never show a rewarded ad to a paid (tip or premium) user.** Paying buys you
  out of the ad; offering one anyway cheapens what they bought.

---

## 4. Ad placements

### A. Game-end interstitial — "after every game"
Games run ~10 min, so one interstitial per game ≈ one per 10 min — a healthy
cadence. The current caps make ads *too sparse* for this. Change which cap does
the work in [adService.js](../frontend/src/ads/adService.js):
- `MIN_GAMES_BETWEEN_ADS = 3` → **`1`** (eligible after every game).
- `MIN_SECONDS_BETWEEN_ADS = 180` → **keep**. This is the only guardrail now, and
  it only bites on the short-game tail (easy-bot stomps, rage-resign streaks,
  disconnect loops) where "every game" would otherwise mean an ad every 90s —
  the pattern Google actually derates. On a normal 10-min game it never triggers.

Off for ad-free users (`isAdFree(profile)`), exactly as
[useMonetization.js](../frontend/src/hooks/useMonetization.js) already gates
`maybeShowGameEndAd()`.

### B. Puzzle modal — clickable **display** ad, same screen as Share, not adjacent
On the puzzle-completion view in
[frontend/src/puzzle/MinedPuzzleModal.jsx](../frontend/src/puzzle/MinedPuzzleModal.jsx),
place a display ad unit (`<ins class="adsbygoogle">`) in the results modal —
**separated** from the Share button, not hugging it. Adjacency to an interactive
button is an accidental-click policy violation. Rules:
- Its own region, clear whitespace between it and any button.
- Labeled "Advertisement".
- Hidden entirely for ad-free users.
- This is a **display** unit — a different AdSense product from the `adBreak()`
  H5 API; new script/slot setup.

Do **not** fire a per-puzzle interstitial via `adBreak()` — puzzles finish in
seconds and that would derate. The display unit on the results modal is the
puzzle surface.

---

## 5. Guardrails (do-not list)
- No clickable ad adjacent to a button (Share, etc.). Same modal is fine; touching
  it is not.
- Keep the 3-min interstitial time floor. Never uncap frequency entirely.
- Rewarded reward granted only in the `adViewed` callback.
- Paid users (tip or premium) are never shown a rewarded prompt.
- Free's ad-gated review ceiling (3) must stay ≤ the tipper's ceiling (5) — never
  let ad-watching beat a payer.
- All quotas are client-side localStorage today; a technical user can bypass
  either. The ladder is about the *offer making honest sense to a normal player*,
  not abuse-proofing. Moving quotas server-side is a later, optional hardening.

---

## 6. Mockups

### Account modal — upsell card (free user)
```
┌─ Your Account ───────────────────────────────── ✕ ┐
│  Rating 1240   Rated 18   Tier [ free ]            │
│  Username [ WaveFunctionWrecker      ] [ Save ]    │
│                                                    │
│  ╭─ ✦ Go Premium · $3/month ───────────────────╮  │
│  │ Quantum Chess is built and run by one        │  │
│  │ person… $3/month keeps the ads off, and:     │  │
│  │   ✦ No ads                                   │  │
│  │   ✦ Unlimited game reviews with engine moves │  │
│  │   ✦ Up to 1,000 saved games                  │  │
│  │   ✦ Premium bots to battle                   │  │
│  │   ✦ Custom profile pic & tagline             │  │
│  │   ✦ The full character roster                │  │
│  │        [  Upgrade — $3/month  ]              │  │
│  │  ───────────────────────────────────────────│  │
│  │  Not a subscription person? Tip $5 for 3     │  │
│  │  months, no ads + 5 engine reviews a day.    │  │
│  │                         [  Tip $5  ]         │  │
│  ╰──────────────────────────────────────────────╯  │
│                                                    │
│  Saved Games (3 of last 10)                        │
│   loss  vs Bishop-3 (980) · white  1240→1232  Replay Share Review │
└────────────────────────────────────────────────────┘
```

### Saved-game Review button — states
```
Premium :  [ Review ]  → opens engine review immediately
Tipper  :  [ Review ]  → opens review, decrements 5/day   (tooltip: "4 reviews left today")
Free    :  [ ▷ Review (watch ad) ]  → rewarded ad → review, decrements 3/day
Free, 0 left / Tipper, 0 left :  [ Review ]  → notice: "used today's N — more tomorrow, or go Premium"
```

### Free rewarded-review flow
```
click "▷ Review (watch ad)"
        │
        ▼
  showRewardedAd()  ──dismissed/unavailable──▶  nothing happens, no charge
        │ adViewed
        ▼
  open engine review  +  markReviewUsed()   (count 1→2→3, then gated till tomorrow)
```

### Puzzle-completion modal — Share + separated display ad
```
┌─ Puzzle solved!  ★★☆ ──────────────────── ✕ ┐
│   +40 · streak 6                             │
│   "Superposition is just a fancy fork."      │
│                                              │
│      [ Next puzzle ]     [ Share ]           │   ← buttons row
│                                              │
│   ····························· (whitespace)  │
│   Advertisement                              │   ← labeled, separated
│   ┌────────────────────────────────────────┐ │
│   │        [ display ad unit ]             │ │   ← NOT adjacent to Share
│   └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
   (entire ad region hidden when isAdFree(profile))
```

### Game-end interstitial (no new UI)
```
game ends → win popup shown → if !isAdFree and eligible (≥1 game since last,
≥180s since last) → adBreak({type:'next'}) interstitial → back to popup.
Change: games-between floor 3 → 1; keep the 180s floor.
```
