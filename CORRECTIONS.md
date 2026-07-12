# Corrections for the contact zap/heal variant (simpler-version branch)

Notes from a read-only review of the in-flight, uncommitted diff. Written
2026-07-11 against the working tree as of that review — re-verify line
references before acting on them.

## 1. Check machinery must be removed for the contact variant

Jasper's ruling: **"since we're zapping kings, there is no such thing as a
king in check anymore."** Kings die two ways only — the king possibility is
zapped away, or the piece holding it is captured like any other piece. A side
loses the moment it has zero pieces whose `possibleTypes` include `k`.

The current diff still routes the contact variant through all of the classic
check logic:

- `generateLegalReplies` (quantumEngine.js) filters every candidate move
  through `hasCollapsedKingCapturable` — in the variant it should not: moving
  a collapsed king into capture range is legal (and simply loses it to a
  capture next turn). This filter is also a big chunk of per-move cost; with
  no check rule, legality is pure geometry.
- `resolveMoveTail` (quantumEngine.js) still runs the "prune mover-side king
  possibilities standing on threatened squares" step (`cloneWithoutKing`)
  for BOTH variants. In the contact variant this silently deletes king
  possibilities with no zap animation and no player-visible cause, and it
  fights the zap/heal economy. Gate it to classic only.
- `evaluateTerminalAfterMove` (quantumEngine.js) still does the
  `isLostInCheck` reply-search (mate = every reply leaves you lost-in-check).
  For the contact variant, terminal should be simply:
  - opponent has zero king-holders → mover wins ("wave function collapse")
  - opponent has no legal replies → draw (no check ⇒ no checkmate; plain
    stalemate). Rare, but decide it deliberately.
- `computeThreatenedSquaresForSide` only counts ≤2-type pieces as attackers —
  that is one of the "≤2 special rules" the variant removes. After the two
  removals above, its remaining variant-path callers (castling-through-threat)
  should either drop the threat test or use all-attackers; pick one
  deliberately.
- UI: check-ray overlays (`listCheckThreats` → Board.jsx) should not render
  in the variant.

## 2. README open-questions block is stale — decisions are made

`README.md`'s variant section still lists as open:

- "Zap/heal one target per move vs. every piece in contact — spec currently
  reads as ONE of each." → **DECIDED: every piece in contact** ("the crazy
  way"). Every attacked enemy sheds its most valuable possibility; every
  protected friendly regains its least valuable feasible one. This is what
  `applyContactZapHeal` already implements — the code is right, the doc is
  behind.
- "Whether any of the old coherence-point / deferred-damage economy
  survives." → **DECIDED: fully replaced.** No coherence points, no
  `observed` marks, no deferred damage, no recohere clock, no Zeno resets,
  no sealed state in the contact variant.

Update the README block to state the decisions instead of the questions.

## 3. UI layer not started

`zappedSquares` / `healedSquares` ride on `lastMove` through
`advanceCore.js`, but nothing renders them yet:

- Requested feedback: a **red circle** that does a little spin animation and
  disappears over each zapped enemy piece; a **green circle** doing the same
  over each healed friendly piece, after every move.
- Natural hook: the existing `measuredSquares` → `measuredMarks`
  (App.jsx) → `measureTargetMarks` per-square ring overlay in Board.jsx —
  mirror that path for the two new square lists.
- `QuantumPiece.jsx` still draws coherence pips, the recohere dot-clock, and
  the sealed line. In the contact variant those mechanics don't exist —
  don't render them (pieces with ≤2 possibilities are only *rendered* as
  pair/single composites, nothing else special). Promotion braces stay.

## 4. Smaller things to double-check

- `computePositionSignature` still folds `coherence` / `recohere` /
  `observed` into the repetition signature. Harmless while those fields sit
  at defaults, but if any classic-path code still mutates them under the
  variant, identical variant positions could get distinct signatures and
  threefold detection breaks. Either freeze those fields in the variant or
  exclude them from the signature when `variant === 'contact'`.
- Fifty-move "progress" currently counts information GAIN. Heals lose
  information; long heal-shuffles in closed positions should still hit the
  fifty-move draw (or count pulses as progress) — make sure the variant
  can't loop forever.
- The AI eval (`alphaBetaEngine.js`) still carries classic-economy terms
  (coherence/observed/option-value). Since search replays the real
  simulators, legality is inherited — but eval terms that reward mechanics
  that no longer exist will misjudge positions. Also worth a term for
  king-holder count (protecting/attacking wave-function-collapse distance),
  which is now the primary win axis.
- Bots must play the variant (that's the whole experiment); make sure the
  worker/search threads `variant` through every payload — `useLocalAi` /
  `aiWorker` / `searchBestMove` / `generateLegalReplies` — with no 'classic'
  fallback hiding in a default arg along the bot path.
