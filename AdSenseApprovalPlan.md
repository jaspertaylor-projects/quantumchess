# AdSense Approval Plan — quantumchess.ninja

**Rejection (Jul 12, 2026):** "Needs attention" — *Google-served ads on screens without
publisher-content* + *Low value content*. Ads.txt already Authorized.

**Hard constraint:** the user experience does not change. Visitors land directly in the
game exactly as today. All content work is invisible to a player who just wants to play.

---

## Why we were rejected

1. The AdSense script sits in the `<head>` of `frontend/index.html`, but the body is just
   `<div id="root"></div>`. Google's approval crawler does not execute the React app —
   it sees an ad-enabled page with **zero content**.
2. The script is also on `privacy.html` and `terms.html`. Google forbids ad code on
   legal/utility pages — that alone triggers the "screens without publisher-content" flag.
3. The only crawlable pages are three short boilerplate pages. And `about.html` still
   describes the OLD ruleset (measurement pulses, decoherence, recoherence) — stale,
   thin, and wrong. That is the "low value content" flag.

## The fix (UX-preserving)

The pattern every approved browser-game site uses: **game fills the viewport at the top of
the page; real text content lives below the fold and on sibling pages.** A player who
lands never sees it. The crawler always does.

### 1. Static below-the-fold content on the homepage
- In `frontend/index.html`, after `<div id="root"></div>`, add a static HTML `<section>`
  (plain HTML in the file, NOT injected by JS) with ~400–600 words: what Quantum Chess
  is, a summary of the Contact Zap/Heal ruleset, the daily puzzle, links to the full
  rules/strategy/FAQ pages.
- The game keeps its `100vh` layout, so this section starts below the fold — landing
  visitors see exactly what they see today. **Never `display:none` it** (hidden text =
  cloaking = worse rejection). It's simply further down the page.
- Check interaction with the global zoom/touch handlers and any `overflow: hidden` on
  `body` — the page must remain scrollable past the game for this to count as visible.
  If the app locks body scroll while playing, scope that lock to the game container.

### 2. Real content pages (static HTML in `frontend/public/`)
Written from `introLessonText.md` + the actual game code — unique text, 500–900 words each:
- **`rules.html`** — the complete Contact Zap/Heal ruleset: superposition, weak
  measurement (Zap), weak entanglement (Heal), hard measurement (Take), spillover
  collapse, shield/blocking, conservation of the chess set, castling-once rule,
  two-rank pawn double-move, promotion bars, en passant.
- **`strategy.html`** — opening ideas, when to Zap vs. Take, protecting your
  king-possible pieces, using Heals, endgame collapse tactics.
- **`faq.html`** — daily puzzles, scoring, streaks, premium ($3/mo), accounts, contact.
- **Rewrite `about.html`** — currently describes the deleted classic ruleset. Rewrite
  for Contact Zap/Heal: the story, why quantum, link to rules.

### 3. Ad-code hygiene
- **Remove** the `adsbygoogle.js` script tag from `privacy.html` and `terms.html`.
- Keep it on: `index.html` (which now has content), `about/rules/strategy/faq`.

### 4. Discoverability
- Shared footer nav on all static pages: Play · Rules · Strategy · FAQ · About ·
  Privacy · Terms.
- One unobtrusive link from inside the app (e.g. existing menu/side tray → "Rules") so
  the pages are reachable from the UI too — no change to the landing flow.
- Add `frontend/public/sitemap.xml` (all pages) and `frontend/public/robots.txt`
  (allow all + sitemap pointer).
- Unique `<title>` + `<meta name="description">` on every page (index.html included).

### 5. Deploy, wait, request review
- Deploy (compose containers, per usual workflow), verify each URL renders on
  production **with JS disabled** — that's the crawler's view.
- Wait ~24–48h so Google can recrawl, then request the review (button location below).
- During review: site stays up, don't click your own ads, don't toggle the ad code.
- Reviews take a few days up to ~2 weeks. Each failed re-review slows the next one
  down, so we want this pass to be the one that sticks.

## Where the "Request review" button is

AdSense → left sidebar **Sites** (the screen in the screenshot) → click the
**quantumchess.ninja** row itself (not the trash icon). A detail panel opens listing the
policy issues; the **Request review** button is at the bottom of that panel. If it's not
there, check ⚠ **Policy center** (left sidebar, or Account → Policy center) — each issue
there has its own Request review action. The button may be greyed out until Google has
recrawled the fixed site — another reason for the 24–48h wait after deploying.

## Order of work
1. Write `rules.html`, `strategy.html`, `faq.html`; rewrite `about.html`.
2. Add below-the-fold section + meta description to `index.html`; verify scrollability.
3. Strip ad script from `privacy.html` / `terms.html`; add shared footer everywhere.
4. `sitemap.xml` + `robots.txt`; in-app "Rules" link in the side tray.
5. Deploy → no-JS check on prod → wait 1–2 days → Request review.
