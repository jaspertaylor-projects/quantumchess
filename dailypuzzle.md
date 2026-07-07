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
  as emoji blocks ▓▓▓▓░░░). Streak = "played daily", bar = the flex.
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
`--verifyDepth` (the gate compares these), and the only-move bar:
`--holdEval -0.5 --failEval -1.5 --minGap 2.0 --minChoices 6` — best move
holds or wins, every alternative clearly fails, and there were enough legal
moves that finding it was a real search.

Output: `tools/mined/mined-seed<N>.json` — per-game results, only-move
chains (full serialized game states + solution lines + Black replies),
quantum-theme tags reusing the composed goals' names (measure3 / The
Instrument, censusCollapse / The Census, seal, snap, unmask, epCheck / The
Phantom, mate), a trickiness score (chain length × search-space ×
how-buried-the-move-is-in-shallow-ordering × theme/quiet bonuses), and the
gate verdicts.

## Remaining to build (in order)

1. [X] Miner + only-move chains + theme tags + double-depth gate (2026-07-06)
2. [ ] Scale runs (overnight, hundreds of games), tune the only-move bar so
       chains of length 2–4 show up at usable rates
3. [ ] Curation/ranking step: pick a week's arc from the mined pool by
       length × trickiness; publish `puzzles.json` to the CDN
4. [ ] Client: one-chance eval-bar puzzle mode (engine plays Black live,
       reuses the review worker), emoji-bar share card
5. [ ] Cut the daily over to mined puzzles once the gate holds at scale;
       keep the composed generator as fallback + tutorial-adjacent content

---

## Original strategy note

So I have a new strategy for the daily puzzle.

simulate a bunch of bot games, with bots of different skill levels.   Use the strongest bot we can make to search trhough games for sequences where there were only moves for 1 move , 2 moves 3 moves 4 moves, 5 moves, 6 moves etc.

(Only moves being moves that there is only one move that holds a level, or winning evaluation)

Then run thsoe through our current puzzle finder to evauluate for trickiness / themes (did any of our only moves feature tricky themes)  

and go from there pick a puzzle with a x lenght sequence with Y trickiness .   

You could get only one chance at the puzzle and whatever the eval is after your moves could be the thing that is shared,  I as a bar where the max eval is the best and you send a filled up horizontal white vrs black eval bar.    We can only give puzzles from the white side.  