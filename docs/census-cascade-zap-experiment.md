# Census-Cascade Zap Experiment

Branch: `experiment/census-cascade-zaps`

## Gameplay rule under test

- Contact and zap targeting are unchanged.
- Zaps still resolve as one simultaneous volley.
- Each contacted enemy tries to lose its highest-value identity:
  King, Queen, Rook, Bishop, Knight, then Pawn.
- A zap is now allowed to trigger census propagation and collapse pieces
  elsewhere on the board.
- The volley is selected jointly so the resulting side still has at least one
  legal census seating.
- If the initial volley would remove every remaining King possibility, all
  affected targets skip King and begin with their next-highest identity.
- When fallback choices conflict, the engine keeps the largest safe subset of
  zaps, preferring higher identities and algebraically earlier contacts as the
  deterministic tie-break.
- A contacted piece shields only when it has no removable identity or no
  jointly census-safe removal remains in that volley.

The reference engine and the packed bot/search engine implement the same rule.

## What to watch during playtesting

- Do collapse chains make zaps feel powerful and legible, or arbitrary?
- Are players able to predict which untouched pieces will collapse?
- Does the reduced number of shields make contact tactics more satisfying?
- Are late-game King hunts clearer under the joint royal fallback?
- Does algebraic tie-breaking become visible in rare conflicting volleys?
- Do cascade zaps create forced wins or material swings that are too large?
- Do zap-oriented bots become disproportionately strong?
- Does move-generation or bot-search performance regress in contact-heavy
  positions?

## Follow-up work if this version is adopted

Gameplay documentation and teaching:

- Rewrite the zap, shield, census, and winning pages in
  `frontend/src/tray/RulesModal.jsx`.
- Update the relevant lessons and interactive fixtures in
  `frontend/src/tutorial/lessons.js`, especially the current census-locked
  shield lesson.
- Update the guided introduction text and any scripted claims about shields or
  non-local zap effects.
- Update `README.md`, `CORRECTIONS.md`, `frontend/public/rules.html`, and the
  census, shield, and zap strategy guides.
- Add a concise in-game explanation for untouched pieces that collapse because
  of a zap elsewhere.

Compatibility and generated content:

- Regenerate replay fixtures because old move histories can resolve
  differently.
- Re-run the tutorial exercise verifier after rewriting the affected lesson.
- Re-mine and re-verify the daily puzzle set; existing mined chains may drift.
- Treat previously saved games as rules-version-dependent if preserving exact
  historical replay becomes important.

Balance and performance:

- Benchmark the packed search in late-game, multi-contact positions.
- Run bot-vs-bot batches and compare zap frequency, game length, promotion,
  checkmate rate, and material volatility with the current live rules.
- Revisit zap/heal personality weights after the baseline rule is chosen.
- Confirm that every reference/packed differential test and long random soak
  remains identical.

Presentation:

- Keep the existing red zap particle on directly contacted targets.
- Decide whether propagated collapses need a secondary visual link or brief
  census ripple so players understand why an untouched piece changed.
- Reserve the gold shield animation for actual failed removals under the new
  definition.

None of those presentation or documentation changes are included on this
experiment branch yet; this branch intentionally changes gameplay and focused
tests only.

## Expected pre-adoption test drift

Two legacy checks intentionally remain red until the experiment is adopted:

- `tests/tutorial-exercises-verify.mjs` still teaches the old census-locked
  shield position; the new rule zaps `d5` and collapses the group.
- `tests/devSavedGames.test.js` has one seeded historical game whose stored
  move list no longer reconstructs because earlier zap outcomes changed.

The new rule-specific tests, random census smoke, reference/packed engine
differential net, and production build must stay green while this branch is
evaluated.
