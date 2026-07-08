# Daily puzzle v2 — mined from real games

## Status (2026-07-06)

The strategy below is being built. Decisions locked in:

- **Stage, don't rip out.** The composed generator (`frontend/src/puzzle/`)
  stays live — it's certified and teaches the mechanics. The miner runs in
  parallel as `tools/puzzle-miner.mjs` until it earns its way into rotation.
- **Gate before switching:** re-search mined only-moves at a depth well above
  mining depth; need **95%+ agreement** before mined puzzles feed the daily.
  The miner prints this rate on every run. If it's low, strengthen the
  eval/search first — better to learn that from a report than from players.
- **One chance, eval-bar scoring.** Player gets one attempt; the engine plays
  Black's best replies live; the final eval is the share ("held +3.2 of +5"
  as emoji blocks ▓▓▓▓░░░).
- **Scoring decisions (2026-07-08):** the NEEDLE'S LANDING SPOT IS THE SCORE.
  Keep a White advantage at the end → ✓ and the streak continues. Gauge
  ticks may leak the legal-move count (fine — solvers enumerate moves
  anyway). Multi-move flow: needle lands, GLOWS, then re-arms and wobbles
  for the next move — a landing per move, relief included.
  Implication for the miner: `holdEval` must rise to ≥ 0 — a puzzle whose
  best move "holds" −0.4 can never earn a ✓ under this scoring.
  **Share bar (2026-07-08):** fill is LINEAR from a floor of −5 to the
  maximum possible score (the best move's eval on the same ruler as the
  needle). Land at the max → full bar; land at/below −5 → empty. E.g. best
  +9.3, you land +3.2 → (3.2+5)/(9.3+5) ≈ 57% → ▓▓▓▓░░░.
- **White-side puzzles only.**
- The composed pipeline's verifier stack survives as **pipeline assertions**
  (position sanity + census fixed-point) — mined game states should pass
  trivially; failures are engine-bug detectors and are logged loudly.

## How to run the miner (in Docker, like everything here)

```bash
docker compose run --rm --no-deps -v "$PWD":/repo -w /repo frontend \
  node tools/puzzle-miner.mjs --games 8 --seed 1
# smoke test: --quick
```

Key knobs (defaults in the script): `--games`, `--seed` (fully reproducible),
`--playMs` (per-move think time in simulated games), `--mineDepth` /
`--verifyDepth` (the gate compares these), and the only-move bar
(reworked 2026-07-08 for landing-spot scoring): `--holdEval 0.0
--minGap 2.0 --minChoices 10`, steps 2+ relaxed to `--extendGap 1.2`.
NO failEval — alternatives may still win (mate-in-3 style); they just land
the needle lower. Hard filters: no plain recaptures of a collapsed piece
(statically-obvious take-backs), no purely classical positions, and no
chains where nothing collapses/decoheres at any ply. The eval gained
`promoImminent`/`promoNear` terms (a definite pawn 1–2 steps from promoting
is most of a queen) — before that, winning promotion races read as fine for
the defender and the f6→f7→f8 2-mover (seed-4 game 98) was invisible.

Output: `tools/mined/mined-seed<N>.json` — per-game results, only-move
chains (full serialized game states + solution lines + Black replies),
quantum-theme tags reusing the composed goals' names (measure3 / The
Instrument, censusCollapse / The Census, seal, snap, unmask, epCheck / The
Phantom, mate), a trickiness score, and the gate verdicts. Trickiness
(reworked 2026-07-08): BASELINE = quantum density (superposed pieces /
alive) + de/recoherence in flight, plus a bonus when the solution's mover
is itself mid de/recoherence (playtesting: those are the hard-to-spot
moves), then chain length, search space, shallow-ordering burial, and
theme/quiet bonuses. Scored from the chain's first position — the one the
player faces.

## First results

**Pilot (2026-07-06, 6 games, seed 2):** 305 positions → 1 certified
only-move; census assertions clean; gate 1/1. Lessons applied: prefilter beam
narrowed (24% were timing out), `failEval` loosened −1.5 → −1.0.

**Scale run (2026-07-06, 60 games, seed 3, ~2h):** 2,888 positions → 66
funnel survivors → **7 only-moves** (0.2%), all length-1, 0 rollout
extensions. Census assertions clean across all 2,888. Highlight: a mined
**en-passant discovered check** (The Phantom) with 66 legal alternatives.
**Gate: 5/6 = 83.3%** — below the 95% bar. The one failure was
depth-instability (same best move, +3.28 at depth 3 vs −0.89 at depth 5),
exactly the predicted engine-as-referee risk. Fixes applied for the next run:
1. **Depth-stability confirm at mine time** — a candidate must be an
   only-move at depth 3 AND depth 4 (cheap: runs only on the ~7/60-games
   that pass the strict bar). The gate at depth 5 then measures real
   stability, not noise.
2. **Stronger bot seats as White** — White-side-only mining made every
   weak-White blowout a dead game; now weak Black blunders into positions
   strong White gets to punish.
3. Prefilter budget 4s → 5s (449/2888 shallow timeouts were skipping the
   richest middlegames).

Multi-move chains stayed rare even with rollout because after the first
punishing move White is usually just winning — many moves hold. If length
2–4 stays scarce, relax the *extension* bar (later steps keep, say, gap ≥
1.5 relative to best rather than the full only-move bar) — with eval-bar
scoring, later steps don't need strict uniqueness, just precision-worth-
testing. Another lever: color-mirror Black-side only-moves into White
puzzles (doubles usable positions; needs a board-flip utility).

**Second scale run (2026-07-07, 100 games, seed 4, ~4.5h) — GATE PASSED:**
4,298 positions → 85 funnel survivors → 11 passed the strict bar → the new
depth-stability confirm killed 3 (0 timeouts) → **8 certified only-moves**,
and the depth-5 gate agreed **8/8 = 100%** (vs 83% without the confirm
stage). Census assertions clean across all 4,298. Also in this run: bots
keep real tiers + blunder noise, stronger bot seats as White, and both
sides play their first two moves as random quiet own-half moves (wired into
`searchBestMove`, so app bots get the same opening variety).

Yield: ~8 per 100 games ≈ 2 puzzles/compute-hour — already enough to feed a
daily rotation of 1-movers with one overnight run a week. Composition is
the next problem: 6/8 are collapsed-queen recaptures with shallowRank 0
(statically obvious); the gems are the two quiet pawn moves and a recapture
of a queen-OR-KING carrier that census-collapses an untouched piece and
unmasks the king. Curation should filter/deprioritize rank-0 bare
recaptures (tag exists in the data: capture-of-collapsed-piece with
shallowRank 0) rather than the miner rejecting them — they're still fine
easy-Monday fodder.

## Dev preview of mined puzzles (the future product's UI)

`http://localhost:5175/?mined=N` (N = 0..7, dev builds only) opens chain N of
`frontend/src/puzzle/minedPreviewData.json` in **the one-chance gauge UI**
(`MinedPuzzleModal.jsx`): player bars (you vs the Stranger) with capture
trays, user board/piece colors throughout, no attempt dots — below the board
an `EvalGauge` speedometer (Black's half left, White's right) with a faint
neon-red tick at every legal move's eval and a needle that wobbles until you
commit, then lands on YOUR move's eval. Ticks use reply-aware evals (min
over Black's answers — static eval would rate "hangs the queen" as fine).
Fail shows the only move + payoff with an arrow. To refresh the fixture
after a new mining run, re-extract chains from `tools/mined/mined-seed<N>.json`
(same slim fields).

## Remaining to build (in order)

1. [X] Miner + only-move chains + theme tags + double-depth gate (2026-07-06)
2. [X] Engine-rollout chain extension (2026-07-06): chains no longer depend
       on the game line cooperating — the miner plays the mined best move,
       the engine answers with Black's best reply (exactly what the live
       eval-bar product does), and the new position is re-analyzed for
       another only-move, up to `--maxChain 6`. Necessary because weak bots
       blunder INTO tactics but don't follow the punishing line afterwards.
       Bot pairings also now keep their real tiers + blunder noise (skill
       diversity creates tactics; the verification gate keeps quality
       independent of how positions arose).
3. [~] Scale runs (overnight, hundreds of games), tune the only-move bar so
       chains of length 2–4 show up at usable rates — 60-game run (seed 3)
       launched 2026-07-06, logs to `tools/mined/run-seed3.log`
4. [ ] Curation/ranking step: pick a week's arc from the mined pool by
       length × trickiness; publish `puzzles.json` to the CDN
5. [ ] Client: one-chance eval-bar puzzle mode (engine plays Black live,
       reuses the review worker), emoji-bar share card
6. [ ] Cut the daily over to mined puzzles once the gate holds at scale;
       keep the composed generator as fallback + tutorial-adjacent content

---

## Original strategy note

So I have a new strategy for the daily puzzle.

simulate a bunch of bot games, with bots of different skill levels.   Use the strongest bot we can make to search trhough games for sequences where there were only moves for 1 move , 2 moves 3 moves 4 moves, 5 moves, 6 moves etc.

(Only moves being moves that there is only one move that holds a level, or winning evaluation)

Then run thsoe through our current puzzle finder to evauluate for trickiness / themes (did any of our only moves feature tricky themes)  

and go from there pick a puzzle with a x lenght sequence with Y trickiness .   

You could get only one chance at the puzzle and whatever the eval is after your moves could be the thing that is shared,  I as a bar where the max eval is the best and you send a filled up horizontal white vrs black eval bar.    We can only give puzzles from the white side.  