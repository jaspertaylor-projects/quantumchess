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

## Adoption

The tutorial, guided game, quick rules and in-game help now teach cascade zaps.
Move-history explanations identify direct contact and distant census changes.
The redundant web article library redirects to the quick rules.

Validation: run the frontend test suite, the guided intro regression tests and a
production build. Replay fixtures must be regenerated for intentional rule changes.
Historical games and mined puzzle data remain rules-dependent; daily loading
checks replayability and uses its existing fallback when a chain no longer plays.
