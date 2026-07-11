# Daily puzzle v2 — mined from real games

## Status (2026-07-08, third design: SWING MINING + PAR SCORING)

The only-move era (below, kept as history) ended with the inventory
deletion: gap-based only-moves contradicted the product's own scoring, and
blunder-farm texture never felt right. Decisions now locked in (Jasper):

- **Mine mistakes, not only-moves.** Strong-vs-stronger bot games (hard
  tier only, blunder noise OFF, higher-rated seats White). The puzzle
  moment is Black's FIRST MISTAKE FROM BALANCE: the eval sat near 0 for a
  stretch, Black moved, and now White's best line reaches `swingMin`. The
  puzzle SHOWS Black's move — the player must capitalize.
- **Perishability instead of only-ness.** No gap requirement at all. The
  MEDIAN legal move must keep less than `perishFrac` of the advantage:
  most moves leak the win, or it's not a test. (The honest generalization
  of the old "cliff" idea, without the binary pretense.)
- **All puzzles are 3-movers.** The miner rolls a PAR LINE — parPlies
  white moves vs engine-best black replies — and every ply must stay
  quantum-tricky (`minPlyTrick`) or the position is rejected. Lines that
  mate before move 3 are rejected too (wrong format); mate ON move 3 is
  fine.
- **Par scoring (fidelity).** The player plays FREE moves; the engine
  answers live. Every move earns a graded square vs that ply's certified
  par eval (🟩 ≥85%, 🟨 ≥50%, 🟥 below, ⬛ unreached), and the final
  landing vs final par is the FIDELITY percent — uncapped, so out-playing
  the certification reads "fidelity 104% ⚡ beyond the line". Share text is
  Wordle-shaped: squares + fidelity + "held +4.9 of +6.2". No binary ✗:
  the landing IS the score.
- **Recoherence is tracked in trickiness** both ways: running clocks count
  in the quantum baseline (pieceInFlux), and an identity actually REGROWING
  during the line tags the `recohere` theme (+ its trickiness bonus).
- **Gate before switching:** re-search every par ply at a depth well above
  mining depth; par must HOLD (deep best ≥ par − 1.0; ply 0 must still
  clear the swing bar). A deeper engine finding a BETTER line only raises
  par — that's fidelity >100% territory, not a failure. Need **95%+**
  agreement before mined puzzles feed the daily.
- **White-side puzzles only.**
- The composed pipeline's verifier stack survives as **pipeline assertions**
  (position sanity + census fixed-point) — mined game states should pass
  trivially; failures are engine-bug detectors and are logged loudly
  (they caught the en-passant recoherence bug on 2026-07-08).

## How to run the miner (in Docker, like everything here)

```bash
docker compose run --rm --no-deps -v "$PWD":/repo -w /repo frontend \
  node tools/puzzle-miner.mjs --games 8 --seed 1
# smoke test: --quick
```

Key knobs (defaults in the script): `--games`, `--seed` (fully
reproducible), `--playMs 900` (strong bots need thinking room),
`--mineDepth` / `--verifyDepth` (the gate compares these), and the SWING
bar (2026-07-08): `--balanceBand 1.25 --balanceStreak 2` (the position must
have probed within ±band for streak consecutive white-to-move plies —
"mistake FROM BALANCE", which also absorbs bots that drift and recover;
probes use fast narrow beams and their own `--probeMs 8000` budget because
a timed-out probe breaks the streak — the first diagnostic run lost 42/98
probes to timeouts and never opened a single balance window; one
out-of-band probe is allowed between the stretch and the candidate, since
seed-3's near-misses showed mistakes developing over two plies),
`--swingDelta 2.0` (the swing must also be a JUMP from the last balanced
eval, not a drift past an absolute line),
`--swingMin 2.5` (post-mistake advantage floor), `--perishFrac 0.34`
(median legal move must keep less than this fraction of the advantage),
`--minChoices 10 --maxChoices 50`, `--minPly 16` ("over 15 moves played"),
`--parPlies 3 --minPlyTrick 4.0` (every par ply must stay this
interesting). Hard filters kept from the only-move era: no plain
recaptures of a collapsed piece as the puzzle start, no purely classical
positions, no lines where nothing collapses/decoheres/recoheres at any
ply. The depth-stability confirm (mineDepth+1, relaxed bars) still guards
against the engine-as-referee depth-flip problem. The eval keeps its
`promoImminent`/`promoNear` terms.

Output: `tools/mined/mined-seed<N>.json` — per-game results and one chain
per accepted mistake: the mistake move + evalBefore/evalAfter, the full
serialized start state (start.lastMove IS the mistake, drawn by the
client), parEvals per ply (the fidelity ruler), spread stats, blackReplies,
theme tags (measure3 / The Instrument, censusCollapse / The Census, seal,
unmask, epCheck / The Phantom, mate, recohere / The Regrowth), per-ply +
aggregate trickiness, and the gate verdicts. Chains also stream to
`chains-seed<N>.ndjson` as found. Trickiness: BASELINE = quantum density
(superposed pieces / alive) + de/recoherence in flight (running recohere
clocks count here), plus a bonus when the solution's mover is itself mid
de/recoherence, then search space, shallow-ordering burial, and
theme/quiet bonuses ('recohere' counts — an identity growing back mid-line
is hard to read ahead of time). Every par ply is scored; `minPlyTrick`
enforces sustained interest and the report keeps trickiness / trickMin /
trickAvg.

## Swing-run history (seeds 3–9, 2026-07-09) and the ready-to-go next run

Roughly 100 games of iteration, zero chains kept, every gate individually
proven out — each run killed exactly one blocker:

- **Seeds 3–6 (strong-vs-stronger, top-4 pool):** balance windows opened
  (14–27 per run) but evenly-matched bots produced ~1 sharp Black mistake
  per 30+ games. Along the way: probe timeouts fixed (fast narrow-tail
  beams + own budget), pre-count size gate (a wasted deep search on a
  wide position costs minutes; counting moves costs 30ms).
- **Seed 7 (Jasper's PHASED HANDOFF — opening pair mid-strong-White vs
  strongest-Black to build a balanced start, controllers swap at
  `--handoffPly 20`: strongest bot takes White, a rank-5-10 bot takes
  Black):** candidate rate jumped to 7 per 16 games. All died at the
  `<50 legal moves` cap.
- **Seed 8 (cap 64):** swings measured at 78/118/149/158 legal moves —
  width is INHERENT to winning quantum positions. Decision: cap dropped
  entirely; `numChoices` is curation metadata. All search roots widened to
  176 (a root-pruned move silently corrupts an eval).
- **Seed 9 (capless):** the funnel finally reached its last gate: 5
  survivors, 4 near-misses with deep bests 1.33/1.77/2.25/2.28 against
  the `swingMin 2.5` floor, 1 depth-confirm reject, zero plumbing rejects.
  The floor is provably ~a quarter-pawn too high for what these games
  produce.

**Queued for the next run (seed 10, NOT yet launched — Jasper wants it
held):** `swingMin 2.5 -> 2.0`, `swingDelta 2.0 -> 1.5` (catches seed-9's
2.25-class misses; perishability + per-ply trickiness remain the real
quality gates), probes switched from analyzeRootMoves to searchBestMove
(root-wide alpha pruning, measured ~6x faster at the same full width),
`--maxPlies 90` (adjudicate at move 45 — no classical-endgame probing),
and the first run whose GAMES benefit from the same-day engine work:
mop-up conversion gradients, repetition avoidance, and the recoherence
fresh-start fix. Suggested launch:
`node tools/puzzle-miner.mjs --games 16 --seed 10 --probeMs 15000 --mineMs 360000 --confirmMs 360000`.

## Seed 11 (2026-07-10): FIRST HARVEST — 5 certified chains from 16 games

All three seed-10 levers landed (mirror passes, minPly 14, strongMs on the
post-handoff White seat only — raised to 2000ms) plus one live-run change:
`balanceBand 1.25 -> 1.5` (Jasper, mid-run: seed-11-v1's game 0 ground to
+1.4 and THEN Black collapsed 1.3 -> 10.2 — a mistake from a slight edge is
exactly the capitalize-now moment; the old band refused it).

Funnel: 1168 positions scanned (both frames), 101 balanced-eligible (seed
10: 30), 20 probe survivors, 6 swings confirmed, 5 chains kept — one of
them a [mirror] find (game 5: ERNEST's own mistake from +0.12, the class
seed 10 was structurally blind to). All five: medianFrac=0, trickiness
7.3-19.5, every chain carries recohere or seal; four of five open QUIET.
Games: White 8, Black 2, draws 6 — the 2000ms capitalizer seat works.

GATE CAVEAT — inconclusive, not failed: 15 par plies queued for the
depth-6 re-search, 14 timed out (120s verifyMs is under-budgeted for
band-1.5 positions; the d6->d5 fallback also timed out), 1 verified and
AGREED with room to spare (par 3.19 -> deep 7.71). The 95% number reads
"100% of 1". Before feeding rotation, re-verify offline: the saved chains
carry start + bestMoves + blackReplies, so each par ply reconstructs by
replay — a standalone re-verify script with a real budget (or
--verifyMs 600000) is the next step.

The five chains are live in the dev preview fixture
(frontend/src/puzzle/minedPreviewData.json, `?mined=0..4`).

Next-run notes: plateau dedupe still unimplemented (a stable +1.1-1.4
position re-buys a deep analysis every other ply; game 0-v2 spent 43min
on 67 positions); verifyMs must scale with the wider band.

## Seed 10 (2026-07-10): handoff 14 + strongMs 1400 — 0 chains, the windows moved

Launched with the queued config plus two changes: `--handoffPly 14` (the
strongest bot takes White after 7 moves, not 10 — Jasper) and the new
`--strongMs 1400` (flat --playMs had neutralized the strongest bot's roster
edge: it keeps its wider beams, and a wider root completes FEWER
iterative-deepening levels on the same 900ms; now its openB/mainW seats
think 1400ms vs 900ms).

Result: 16 games (7 move-cap draws, 5 White mates, 4 Black mates), 579
positions probed, only 30 balanced-eligible, 10 probe survivors, 8 weak-swing
rejects, 0 chains. The games got the INTENDED texture — tight, half of them
wire-to-wire draws — but the mistakes moved out of the detector's window:

- Ernest's wins were fast (45-71 plies): Black's decisive error lands before
  the ply-20 `minPly` floor or before a 2-probe balance streak can form.
- The balanced games stayed balanced (that's what 1400ms vs 900ms at these
  depths produces): near-misses plateaued at deep-best ~0.6-1.2, far under
  swingMin 2.0.
- One inverted window (game 11 @ply 48: 0.7 -> deep -6.09): a genuine
  mistake-from-balance by WHITE, which the White-only detector is
  structurally blind to.

Levers for seed 11, in suggested order:
1. **Mine both colors** — mirror the detector for Black-capitalizing windows
   (the miner already probes every white-to-move ply; a black pass reuses the
   same machinery with sides flipped). Doubles the harvest surface and
   catches game-11-style windows.
2. **Lower `minPly` toward 14** (the new handoff): with the swap 6 plies
   earlier, mid-game texture starts earlier too — fast-win mistakes at plies
   14-18 are currently below the floor.
3. **Plateau dedupe** — a stable +1.1 position re-triggers a full deep
   analysis every other ply (game 8 burned 20 minutes on 12 positions this
   way; probe trigger swingMin-1=1.0 sits inside balanceBand 1.25). Skip the
   deep pass when the probe matches the last deep-rejected value within
   epsilon.

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

**Gem playtest correction (2026-07-08, Jasper):** the two "quiet pawn
moves" (games 93/98) are actually CLEAR PROMOTION PUSHES — the tagger's
`quiet` (no capture, no check) can't tell a waiting move from a pawn
walking into a queen, and the trickiness quiet-bonus rewarded exactly the
wrong thing. Fixed: definite-pawn pushes to the 7th/8th now tag `promo`,
are excluded from `quiet`, and earn no theme bonus (stale `quiet` tags
remain in the seed-3/4/5 reports). The census-unmask recapture (seed 4
game 1, `?mined=1`) is the curation benchmark — notably, a promotion move
is available there and is NOT the winning move. Also: playtesting the
seed-3 phantom exposed a LIVE ENGINE BUG — the en-passant capture collapses
the mover to a definite pawn, but if the mover's recoherence clock was one
tick from full, the same turn's owner-effects paid out the regained
identity immediately, silently erasing the collapse (`resetCoherenceOnCollapse`
then saw no shrink and reset nothing). Fixed in `applyOwnerTurnEffects`:
a piece whose possibility set shrank during the move's own resolution
never ticks its clock that turn (collapse = fresh start). Engine replay
fixtures regenerated — 15/41 pinned games changed, which is how often this
was firing in ordinary play.

**Inventory deleted (2026-07-08, Jasper): every mined puzzle is gone.**
`tools/mined/` cleared (seeds 1–2 remain in git history; the rest were
untracked but fully reproducible by `--seed`) and the preview fixture
emptied. Verdict from playtesting the gems: the "quiet pawn moves" were
clear promotions, and even the census-unmask benchmark (`?mined=1`) was
only OK. Mining's BEST case failed the feel bar — weight that heavily when
choosing between the cliff retune and composed (Strategy A) puzzles. The
same-day rules changes (recoherence fresh-start, castling entanglement
removal) had already staled every certification, so nothing of value was
lost: any future run re-mines and re-certifies under current rules.

**Rules change (2026-07-08, Jasper): castling entanglement removed.** With
single-history gone, the entanglement link never made sense to keep: the
global census already keeps the kings honest (confirm a King anywhere and
every other piece sheds `k`), and the never-recohere lock made castling a
strictly bad move. Now the castled pair leaves as two ordinary rook-or-king
superpositions that recohere like anything else. The entire entanglement
mechanism went with it (it had no other source): `resolveEntanglements`,
the chain-link insignia + its settings toggle, the tutorial chain-link
page, and the miner's `snap` theme. The snap-family recipes survived by
redesign: the pair is now `{q,k}` (a "royal pair") — one queen slot + one
king slot means the census alone anti-correlates them, so capturing one
(it collapses to Queen; capture-collapse never yields King) still unmasks
the other, at any distance. Hunt's maybe-king pretenders could not survive
(with the pair census-locked, no other piece can hold `k` at fixed point);
they became `{n,b}` texture screened off the ladder squares (a two-branch
blur refutes cutoffs the old one-branch pretenders couldn't reach — found
via `debugRecipe` failure stats: `pad`, then `p1:unsound`). Harness
verified vs stashed baseline over 56- and 84-day windows: recipe counts
match HEAD exactly (hunt3 12/12, hunt4 12/12, snaptrap 12/12, fails 0).

## Multi-move improvement plan

The current miner is good at finding **single sharp moments** and bad at
finding naturally consecutive multi-movers. The saved reports confirm this:
every mined chain so far is length 1. This is not just a scale problem. The
objective function is selecting positions where the tactical tension resolves
in one move; after that first punishing move, White is usually winning enough
that many continuations "hold", so strict only-move chaining dies.

Do not expect bot self-play + consecutive only-moves to reliably produce the
daily's 2-4 move inventory. Keep mining for one-move gems and real-game
texture, but use a different shape for multi-move puzzles.

### Design rule: quantum moves must carry the chain

Multi-move puzzles should not feel like classical tactics wearing quantum
clothes. If `hunt3` / `hunt4` collapse into "put a queen-containing piece in
the middle of the board", demote or retire them from the daily arc. Ladder
mates are readable, but they risk making the quantum state irrelevant after
the first move.

Add/keep a verifier or curation rule for multi-movers:

```js
nonFinalQuantumMove =
  possDelta > 0 ||
  measuredSquares.length >= 2 ||
  targetRecohereReset ||
  targetBecomesSealed ||
  untouchedPieceCollapses ||
  entangledPairResolves
```

For every 2+ move puzzle, at least one non-final move should pass this test;
for 3-4 movers, ideally most non-final moves should. The player should feel
that each move changes what reality permits, not merely that a heavy piece
centralized or gave a normal check.

### Strategy A: build backward from payoffs

For multi-move puzzles, start with a known satisfying final payoff:

- mate across every world
- seal a nearly-defined target
- snap an entangled pair
- census-collapse an untouched piece
- capture the now-known queen/rook/king-carrier
- en passant discovered check
- promotion branch revealed or killed

Then generate one move earlier: find a position where exactly one White setup
move, followed by a scripted or engine-plausible Black reply, creates that
payoff. Repeat once more for 3-movers. This is better aligned with the
existing composed generator than trying to mine consecutive only-moves from
bot games.

Shape:

```text
final tactic exists
<- hide it behind one required quantum setup
<- optionally hide that behind another setup
```

The existing `verifyCandidate()` already supports this: each ply has a
subgoal, a uniqueness check over all legal White moves, and an optional
scripted Black reply. Use that machinery rather than demanding the eval
miner rediscover a whole line.

### Strategy B: prelude grafting

Take reliable one-move recipes and graft a short prelude onto them. Example
base payoffs:

- `mate`
- `census`
- `seal`
- `snap`
- `phantom`
- `instrument`

Prelude transforms to try:

- move a blocker out of the way
- force/allow Black's king or target to move one square
- measure a piece so deferred damage lands after Black ignores it
- complete one census so a final target becomes vulnerable
- make a rook/queen line appear only after a reply
- reset a recoherence clock so an escape identity cannot return
- kill or reveal a promotion branch before the payoff

Then run the normal verifier. This should produce more good 2-3 movers per
hour than pure self-play mining, while still allowing seeded variety.

### Strategy C: setup-move mining instead of only-move chaining

Upgrade the miner to search for positions where exactly one **setup move**
creates a good puzzle after Black replies. The current miner asks:

```text
Is this position already an only-move?
```

For multi-movers, ask:

```text
Does exactly one White move create a known one-move tactic after Black's
best/plausible reply?
```

Sketch:

```text
for each White-to-move position:
  enumerate legal White setup moves
  for each setup:
    apply setup
    choose Black reply (engine-best, or best reply that does not refute)
    scan resulting White position for a known payoff:
      mate / seal / census / snap / phantom / target capture
  keep positions where exactly one setup produces a strong payoff
```

This is the middle path: more organic than hand-authored recipes, but much
more productive than waiting for consecutive only-move positions to occur in
self-play. A setup move may be quiet or only slightly best by eval; its value
is that it creates the next quantum fact.

### Preferred multi-move templates

**Probe -> Shed -> Punish**

White lands a measurement pulse that marks a key piece. Black replies with a
different piece. The marked piece loses coherence or sheds a cheap identity.
White exploits the newly narrowed target.

Why it works: the first move matters because of measurement, not because it
is a normal check.

**Census -> Newly Known Target -> Capture**

White captures one ambiguous piece. That completes a type census and forces
an untouched target to become definite. The follow-up captures or mates using
that new fact.

This is close to `investigation`; keep pushing in this direction.

**Seal -> No Recoherence Escape -> Payoff**

White seals a nearly-defined defender. Black makes a waiting move. The
follow-up works because the defender cannot regain the identity that would
save it.

This is strongly quantum: the tactic is about preventing future possibilities.

**Snap -> Identity Cascade -> Surgical Follow-up**

White snaps an entangled pair, but the follow-up should not just become a
ladder mate. Prefer a payoff where the snap reveals which square is defended,
which piece is the king/rook, or which capture is now sound.

**Phantom -> Discovery -> Exploit**

Use en passant discovered check as the first move or the payoff. A 2-mover can
force/recognize the phantom capture, then exploit the opened file/diagonal or
the pawn-collapse census.

**Recoherence Clock Puzzle**

A piece with two identities is about to regain a third. The only move is to
measure it, attack it, or force it to move so its recoherence clock resets.
The follow-up works because it stayed narrow.

This may be one of the most "only in Quantum Chess" multi-move motifs.

### Recommended slate direction

Replace the ladder-heavy part of the arc with state-changing chains:

- Wed: `ledger`-style census -> seal
- Thu: probe -> shed -> punish
- Fri: `investigation`-style measure -> census -> capture
- Sun: snap / phantom / recoherence-clock special, 3-4 moves, but not a
  generic ladder mate

Keep `hunt3` / `hunt4` available as fallback/tutorial-adjacent material only
if they pass the state-changing rule and do not read as "queen-ish piece to
the center".

## Dev preview of mined puzzles (the future product's UI)

`http://localhost:5175/?mined=N` (N indexes the fixture's chains, 0-based;
dev builds only) opens chain N of
`frontend/src/puzzle/minedPreviewData.json` in **PAR MODE**
(`MinedPuzzleModal.jsx`, rebuilt 2026-07-08): player bars (you vs the
Stranger) with capture trays, user board/piece colors throughout. The
board opens on the position AFTER Black's mistake, with a black arrow on
the mistake move and the gauge caption "Black slipped: d7 → d6.
Capitalize." The player then plays **3 free moves** — no exactMove, any
legal move counts — and the engine answers as Black live (depth-3 worker,
greedy 1-ply fallback on timeout). Per move: the needle lands on the
move's eval (`EvalGauge` ticks = reply-aware evals of every legal move,
swapped for depth-3 worker scores when ready), a rank line gives the exact
standing ("3rd best move of 45"), and a GRADED SQUARE lights vs that
ply's certified par eval (🟩 ≥85% of par, 🟨 ≥50%, 🟥 below, ⬛ never
reached — early mate fills the rest 🟩). After move 3: **fidelity** =
final landing / final par, uncapped (beat the certification → ">100% ⚡
beyond the line"), a graded banner, and a Wordle-shaped share text with a
copy button:

```text
⚛️ Quantum Chess · mined mined-0
🟩🟨🟩 fidelity 84%
held +4.9 of +6.2
```

On a rough run (first square not green) the start position returns with
the par line's first move drawn as an arrow. To refresh the fixture after
a mining run, extract chains from `tools/mined/mined-seed<N>.json` (the
chain objects are already the fixture shape; par evals are clamped to the
client's 30-cap mate ruler at load).

**Dev game viewer (2026-07-08):** `?minedGame=N` opens miner game N —
bot names + result in the headline, full replay, and a clickable EVAL
GRAPH of the whole game (white-positive, balance band tinted; click to
seek) — in the existing premium `ReviewModal` via two opt-in props
(`showEvalGraph`, `game.headline`); the live product surface is unchanged
when they're absent. The graph computes CLIENT-SIDE in a 3-worker pool so
the modal pops immediately and the curve fills coarse-to-fine: a fast
pass at parity-matched depths (white-to-move d2 / black-to-move d1 —
every lookahead ends after a Black move, killing the tempo sawtooth a
fixed depth produces), then a deep pass at d6/d5 replaces each point
(timeouts keep the fast value; games over 64 plies sample every other
ply). Fixture: `frontend/src/puzzle/minedGamesData.json`, extracted from
a report's `games` array (each game carries stored-format `moves`; the
miner's own probe evals stay in the report for miner-side tuning only).
The graph is the knob-tuning instrument: one glance shows where games sit
relative to the balance band and where the swings are.

## Remaining to build (in order)

1. [X] Miner + only-move chains + theme tags + double-depth gate (2026-07-06)
2. [X] Engine-rollout chain extension (2026-07-06)
3. [X] SWING REWORK (2026-07-08): mistakes-from-balance + perishability +
       3-move par lines with sustained trickiness + par-holds gate; strong
       bots only, no blunder noise; recoherence tracked (baseline clocks +
       'recohere' regrowth theme). First 30-game run: seed 1, logs to
       `tools/mined/run-seed1.log`.
4. [X] Client par mode (2026-07-08): free play vs live engine Black,
       per-move graded squares, fidelity score, share text with copy.
       Dev-preview only (`?mined=N`).
5. [ ] Tune the swing knobs from real runs (balanceBand/streak, swingMin,
       perishFrac, minPlyTrick) until yield is a few chains per 30 games
       AND they feel right; then scale overnight.
6. [ ] Curation/ranking step: pick a week's arc from the mined pool by
       trickiness × swing size; publish `puzzles.json` to the CDN
7. [ ] Cut the daily over to mined puzzles once the gate holds at scale;
       keep the composed generator as fallback + tutorial-adjacent content

---

## Original strategy note

So I have a new strategy for the daily puzzle.

simulate a bunch of bot games, with bots of different skill levels.   Use the strongest bot we can make to search trhough games for sequences where there were only moves for 1 move , 2 moves 3 moves 4 moves, 5 moves, 6 moves etc.

(Only moves being moves that there is only one move that holds a level, or winning evaluation)

Then run thsoe through our current puzzle finder to evauluate for trickiness / themes (did any of our only moves feature tricky themes)  

and go from there pick a puzzle with a x lenght sequence with Y trickiness .   

You could get only one chance at the puzzle and whatever the eval is after your moves could be the thing that is shared,  I as a bar where the max eval is the best and you send a filled up horizontal white vrs black eval bar.    We can only give puzzles from the white side.  
